import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabaseAdmin'

export interface VerifiedSession {
  userId: string
  clientId: string
  /** User-scoped Supabase client — every query through it is subject to RLS. */
  supabase: SupabaseClient
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
    const { data, error } = await anonClient().auth.refreshSession({
      refresh_token: row.supabase_refresh_token,
    })
    if (error || !data.session) return null

    supabaseAccessToken = data.session.access_token
    await admin
      .from('oauth_tokens')
      .update({
        supabase_access_token: data.session.access_token,
        supabase_refresh_token: data.session.refresh_token,
        supabase_expires_at: new Date((data.session.expires_at ?? 0) * 1000).toISOString(),
      })
      .eq('access_token', token)
  }

  return {
    userId: row.user_id,
    clientId: row.client_id,
    supabase: anonClient(supabaseAccessToken),
  }
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice('Bearer '.length).trim()
}
