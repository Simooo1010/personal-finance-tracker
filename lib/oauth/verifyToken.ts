import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { createReadOnlyDb, type ReadOnlyDb } from '@/lib/ai-data/readonly'
import { isEmailAllowed } from '@/lib/oauth/allowlist'
import { jwtExpiryMs } from '@/lib/oauth/independentSession'

export interface VerifiedSession {
  userId: string
  clientId: string
  /**
   * Read-only view of the user-scoped (RLS) Supabase client. The full client is
   * deliberately not exposed: nothing downstream needs write access.
   */
  db: ReadOnlyDb
}

/** Injectable dependencies (production values in verifyBearerToken; fakes in tests). */
export interface VerifyDeps {
  /** Service-role client, used ONLY for the oauth_tokens bookkeeping row. */
  admin: SupabaseClient
  /** Returns an anon client, optionally carrying a user's Supabase access token. */
  anon: (accessToken?: string) => SupabaseClient
  now?: () => number
}

interface StoredSession {
  accessToken: string
  refreshToken: string
  expiresAtMs: number
}

/** Refresh the Supabase session when it expires within this window. */
const REFRESH_MARGIN_MS = 60_000

function anonClient(accessToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  })
}

/**
 * Turns an opaque access_token issued by /api/oauth/token into a user-scoped
 * Supabase client, refreshing the underlying Supabase session transparently
 * if it's close to expiring (or if Supabase rejects it as expired). Returns
 * null if the token is unknown/expired, if the Supabase session can't be
 * recovered, if it doesn't belong to the token's user, or if that user's
 * email is not in the AI-integration allowlist (lib/oauth/allowlist.ts).
 */
export async function verifyBearerToken(token: string): Promise<VerifiedSession | null> {
  if (!token) return null
  return verifyBearerTokenWith(token, { admin: createAdminClient(), anon: anonClient })
}

/** verifyBearerToken with injected clients (unit-testable core). */
export async function verifyBearerTokenWith(token: string, deps: VerifyDeps): Promise<VerifiedSession | null> {
  if (!token) return null
  const now = deps.now ?? Date.now

  const { data: row } = await deps.admin
    .from('oauth_tokens')
    .select('*')
    .eq('access_token', token)
    .maybeSingle()

  if (!row) return null
  if (new Date(row.expires_at).getTime() < now()) return null

  const rowUserId: string = row.user_id
  let session = sessionFromRow(row)
  let refreshed = false

  if (now() > session.expiresAtMs - REFRESH_MARGIN_MS) {
    const next = await sharedRefresh(deps, token, rowUserId, session)
    if (!next) return null
    session = next
    refreshed = true
  }

  // Resolve the real user behind the Supabase session and enforce the account
  // allowlist. Cached per opaque access_token (short TTL, never past the token's
  // expiry) so parallel tool calls don't each pay the getUser round trip.
  const tokenExpiresAt = new Date(row.expires_at).getTime()
  let userId = cachedUserId(token, rowUserId, now())
  if (!userId) {
    let result = await safeGetUser(deps, session.accessToken)
    if (result.error && !refreshed && isRejectedJwtError(result.error)) {
      // Stored expiry said the JWT was still fine but Supabase disagrees
      // (clock skew, revoked/expired token): force one refresh and retry once.
      console.warn(`[mcp-auth] supabase jwt rejected, forcing refresh: ${errorCode(result.error)}`)
      const next = await sharedRefresh(deps, token, rowUserId, session)
      if (!next) return null
      session = next
      refreshed = true
      result = await safeGetUser(deps, session.accessToken)
    }
    const user = result.user
    if (result.error || !user) {
      console.warn(`[mcp-auth] getUser failed: ${errorCode(result.error)}`)
      verifiedUsers.delete(token)
      return null
    }
    if (user.id !== rowUserId) {
      console.warn('[mcp-auth] user mismatch')
      verifiedUsers.delete(token)
      return null
    }
    if (!isEmailAllowed(user.email)) {
      console.warn('[mcp-auth] email not allowed')
      verifiedUsers.delete(token)
      return null
    }
    userId = user.id
    verifiedUsers.set(token, {
      userId,
      expiresAt: Math.min(now() + VERIFIED_USER_TTL_MS, tokenExpiresAt),
    })
  }

  return {
    userId,
    clientId: row.client_id,
    db: createReadOnlyDb(deps.anon(session.accessToken), userId),
  }
}

function sessionFromRow(row: {
  supabase_access_token: string
  supabase_refresh_token: string
  supabase_expires_at: string
}): StoredSession {
  const parsed = new Date(row.supabase_expires_at).getTime()
  return {
    accessToken: row.supabase_access_token,
    refreshToken: row.supabase_refresh_token,
    // Unparseable stored expiry -> treat as expired so it gets refreshed.
    expiresAtMs: Number.isFinite(parsed) ? parsed : 0,
  }
}

async function safeGetUser(
  deps: VerifyDeps,
  accessToken: string
): Promise<{ user: { id: string; email?: string | null } | null; error: unknown }> {
  try {
    const { data, error } = await deps.anon().auth.getUser(accessToken)
    return { user: data?.user ?? null, error: error ?? null }
  } catch (err) {
    return { user: null, error: err ?? new Error('getUser threw') }
  }
}

const VERIFIED_USER_TTL_MS = 5 * 60 * 1000
const verifiedUsers = new Map<string, { userId: string; expiresAt: number }>()

/** Returns the cached, already-verified user id for this access_token, if still fresh and consistent. */
function cachedUserId(token: string, rowUserId: string, now: number): string | null {
  // Opportunistic cleanup so the map can't grow without bound.
  if (verifiedUsers.size > 100) {
    for (const [key, entry] of verifiedUsers) if (entry.expiresAt <= now) verifiedUsers.delete(key)
  }
  const entry = verifiedUsers.get(token)
  if (!entry) return null
  if (entry.expiresAt <= now || entry.userId !== rowUserId) {
    verifiedUsers.delete(token)
    return null
  }
  return entry.userId
}

/**
 * Concurrent requests that would refresh the same Supabase refresh token share
 * one refresh (Supabase rotates refresh tokens, so parallel refreshes with the
 * same one would race). Per server instance only; across instances the
 * compare-and-swap write + re-read recovery in refreshAndStore handle it.
 */
const refreshesInFlight = new Map<string, Promise<StoredSession | null>>()

function sharedRefresh(
  deps: VerifyDeps,
  token: string,
  userId: string,
  used: StoredSession
): Promise<StoredSession | null> {
  const key = used.refreshToken
  let pending = refreshesInFlight.get(key)
  if (!pending) {
    pending = refreshAndStore(deps, token, userId, used, 0).finally(() => refreshesInFlight.delete(key))
    refreshesInFlight.set(key, pending)
  }
  return pending
}

/**
 * Refreshes the Supabase session behind an access_token and stores it with a
 * compare-and-swap on the refresh token that was consumed, so a stale writer
 * never overwrites newer tokens. On failure, re-reads the row to pick up a
 * rotation done by another instance; only a definitive failure (dead refresh
 * token / session / user) invalidates the row, so the client's refresh grant
 * fails with invalid_grant and the user is asked to reconnect. Transient
 * failures leave the row alone.
 */
async function refreshAndStore(
  deps: VerifyDeps,
  token: string,
  userId: string,
  used: StoredSession,
  depth: number
): Promise<StoredSession | null> {
  const now = deps.now ?? Date.now
  verifiedUsers.delete(token)

  let data: { session: { access_token: string; refresh_token: string; expires_at?: number; expires_in?: number } | null } | null = null
  let error: unknown = null
  try {
    const res = await deps.anon().auth.refreshSession({ refresh_token: used.refreshToken })
    data = res.data
    error = res.error
  } catch (err) {
    error = err ?? new Error('refreshSession threw')
  }

  const fresh = data?.session
  if (!error && fresh?.access_token && fresh.refresh_token) {
    const next: StoredSession = {
      accessToken: fresh.access_token,
      refreshToken: fresh.refresh_token,
      expiresAtMs:
        typeof fresh.expires_at === 'number'
          ? fresh.expires_at * 1000
          : (jwtExpiryMs(fresh.access_token) ?? now() + (fresh.expires_in ?? 0) * 1000),
    }
    // CAS on the consumed refresh token (scoped to the user). Not keyed on the
    // opaque access_token: /api/oauth/token rotates that in place, and the
    // Supabase tokens must still land on the row.
    const { data: rows, error: writeError } = await deps.admin
      .from('oauth_tokens')
      .update({
        supabase_access_token: next.accessToken,
        supabase_refresh_token: next.refreshToken,
        supabase_expires_at: new Date(next.expiresAtMs).toISOString(),
      })
      .eq('user_id', userId)
      .eq('supabase_refresh_token', used.refreshToken)
      .select('access_token')
    if (writeError) {
      console.error(`[mcp-auth] refresh store failed: ${errorCode(writeError)}`)
    } else if (!Array.isArray(rows) || rows.length === 0) {
      console.warn('[mcp-auth] refresh not stored: row changed by another writer')
    }
    verifiedUsers.delete(token)
    return next
  }

  console.error(`[mcp-auth] refresh failed: ${error ? errorCode(error) : 'no_session'}`)

  // Another instance may already have rotated this session: re-read the row.
  const { data: current, error: readError } = await deps.admin
    .from('oauth_tokens')
    .select('*')
    .eq('access_token', token)
    .maybeSingle()
  if (readError) {
    console.error(`[mcp-auth] row re-read failed: ${errorCode(readError)}`)
    return null
  }
  if (!current) {
    console.warn('[mcp-auth] row gone after refresh failure')
    return null
  }
  if (current.user_id !== userId) return null

  const latest = sessionFromRow(current)
  const rotated = latest.refreshToken !== used.refreshToken
  const latestAccessUsable = latest.expiresAtMs - REFRESH_MARGIN_MS > now()
  if (rotated || (latest.accessToken !== used.accessToken && latestAccessUsable)) {
    if (latestAccessUsable) {
      console.warn('[mcp-auth] recovered tokens rotated by another instance')
      return latest
    }
    if (rotated && depth === 0) {
      console.warn('[mcp-auth] retrying refresh with rotated token')
      return refreshAndStore(deps, token, userId, latest, depth + 1)
    }
    return null
  }

  if (isDefinitiveRefreshError(error)) {
    // Compare-and-swap delete: never drops a row that was just rotated.
    const { error: deleteError } = await deps.admin
      .from('oauth_tokens')
      .delete()
      .eq('access_token', token)
      .eq('supabase_refresh_token', used.refreshToken)
    if (deleteError) console.error(`[mcp-auth] row invalidation failed: ${errorCode(deleteError)}`)
    else console.error(`[mcp-auth] row invalidated: ${errorCode(error)}`)
    verifiedUsers.delete(token)
    return null
  }

  console.warn(`[mcp-auth] transient refresh failure, row kept: ${errorCode(error)}`)
  return null
}

interface ErrorShape {
  code?: unknown
  status?: unknown
  name?: unknown
  message?: unknown
}

function asErrorShape(error: unknown): ErrorShape {
  return error && typeof error === 'object' ? (error as ErrorShape) : {}
}

/** Short, token-free reason code for logs. */
function errorCode(error: unknown): string {
  if (!error) return 'no_user'
  const e = asErrorShape(error)
  if (typeof e.code === 'string' && e.code) return e.code
  if (typeof e.status === 'number' && e.status > 0) return `status_${e.status}`
  if (typeof e.name === 'string' && e.name) return e.name
  return 'unknown'
}

function isTransientError(error: unknown): boolean {
  const e = asErrorShape(error)
  if (e.name === 'AuthRetryableFetchError') return true
  if (typeof e.status === 'number') return e.status === 0 || e.status === 429 || e.status >= 500
  // No HTTP status at all (network failure, thrown exception) -> transient.
  return typeof e.code !== 'string'
}

const DEFINITIVE_REFRESH_CODES = new Set([
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_not_found',
  'session_expired',
  'user_not_found',
  'user_banned',
  'invalid_grant',
])
const DEFINITIVE_REFRESH_MESSAGE =
  /invalid refresh token|refresh token not found|already used|session (?:not found|expired)|user not found|invalid_grant/i

function isDefinitiveRefreshError(error: unknown): boolean {
  if (!error) return false
  const e = asErrorShape(error)
  if (typeof e.code === 'string' && DEFINITIVE_REFRESH_CODES.has(e.code)) return true
  if (isTransientError(error) && typeof e.status === 'number') return false
  return typeof e.message === 'string' && DEFINITIVE_REFRESH_MESSAGE.test(e.message)
}

const REJECTED_JWT_CODES = new Set(['bad_jwt', 'session_not_found', 'session_expired', 'no_authorization'])

/** getUser failed because the access token is expired/invalid (not a network/server problem). */
function isRejectedJwtError(error: unknown): boolean {
  const e = asErrorShape(error)
  if (typeof e.code === 'string' && REJECTED_JWT_CODES.has(e.code)) return true
  if (e.status === 401 || e.status === 403) return true
  if (isTransientError(error)) return false
  return typeof e.message === 'string' && /jwt|expired|invalid.*token/i.test(e.message)
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice('Bearer '.length).trim()
}
