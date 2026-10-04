import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { createReadOnlyDb, type ReadOnlyDb } from '@/lib/ai-data/readonly'

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
 * if it's close to expiring. Returns null if the token is unknown/expired.
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

  return {
    userId: row.user_id,
    clientId: row.client_id,
    db: createReadOnlyDb(anonClient(supabaseAccessToken)),
  }
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
