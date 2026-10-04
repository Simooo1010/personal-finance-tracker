import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { createReadOnlyDb, type ReadOnlyDb } from '@/lib/ai-data/readonly'
import { isEmailAllowed } from '@/lib/oauth/allowlist'

export interface VerifiedSession {
  userId: string
  clientId: string
  /**
   * Read-only view of the user-scoped (RLS) Supabase client. The full client is
   * deliberately not exposed: nothing downstream needs write access.
   */
  db: ReadOnlyDb
}

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
 * if it's close to expiring. Returns null if the token is unknown/expired, if
 * the Supabase session doesn't belong to the token's user, or if that user's
 * email is not in the AI-integration allowlist (lib/oauth/allowlist.ts).
 */
export async function verifyBearerToken(token: string): Promise<VerifiedSession | null> {
  if (!token) return null
  const admin = createAdminClient()

  const { data: row } = await admin
    .from('oauth_tokens')
    .select('*')
    .eq('access_token', token)
    .maybeSingle()

  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) return null

  let supabaseAccessToken: string = row.supabase_access_token
  const supabaseExpiresAt = new Date(row.supabase_expires_at).getTime()

  if (Date.now() > supabaseExpiresAt - 60_000) {
    // Concurrent requests with the same token share one refresh: Supabase rotates
    // refresh tokens, so parallel refreshes with the same one would race.
    // (Per server instance only; separate instances can still overlap.)
    let pending = refreshesInFlight.get(token)
    if (!pending) {
      pending = refreshSupabaseSession(admin, token, row.supabase_refresh_token).finally(() =>
        refreshesInFlight.delete(token)
      )
      refreshesInFlight.set(token, pending)
    }
    const refreshed = await pending
    if (!refreshed) return null
    supabaseAccessToken = refreshed
  }

  // Resolve the real user behind the Supabase session and enforce the account
  // allowlist. Cached per opaque access_token (short TTL, never past the token's
  // expiry) so parallel tool calls don't each pay the getUser round trip.
  const tokenExpiresAt = new Date(row.expires_at).getTime()
  let userId = cachedUserId(token, row.user_id)
  if (!userId) {
    const { data: userData, error: userError } = await anonClient().auth.getUser(supabaseAccessToken)
    const user = userData?.user
    if (userError || !user || user.id !== row.user_id || !isEmailAllowed(user.email)) {
      verifiedUsers.delete(token)
      return null
    }
    userId = user.id
    verifiedUsers.set(token, {
      userId,
      expiresAt: Math.min(Date.now() + VERIFIED_USER_TTL_MS, tokenExpiresAt),
    })
  }

  return {
    userId,
    clientId: row.client_id,
    db: createReadOnlyDb(anonClient(supabaseAccessToken), userId),
  }
}

const VERIFIED_USER_TTL_MS = 5 * 60 * 1000
const verifiedUsers = new Map<string, { userId: string; expiresAt: number }>()

/** Returns the cached, already-verified user id for this access_token, if still fresh and consistent. */
function cachedUserId(token: string, rowUserId: string): string | null {
  const now = Date.now()
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

const refreshesInFlight = new Map<string, Promise<string | null>>()

/** Refreshes the Supabase session behind an access_token; returns the new Supabase access token or null. */
async function refreshSupabaseSession(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
  refreshToken: string
): Promise<string | null> {
  const { data, error } = await anonClient().auth.refreshSession({ refresh_token: refreshToken })
  if (error || !data.session) return null

  await admin
    .from('oauth_tokens')
    .update({
      supabase_access_token: data.session.access_token,
      supabase_refresh_token: data.session.refresh_token,
      supabase_expires_at: new Date((data.session.expires_at ?? 0) * 1000).toISOString(),
    })
    .eq('access_token', token)
  return data.session.access_token
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice('Bearer '.length).trim()
}
