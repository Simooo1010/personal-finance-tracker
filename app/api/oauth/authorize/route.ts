import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { randomToken } from '@/lib/oauth/pkce'
import { isEmailAllowed } from '@/lib/oauth/allowlist'

const CODE_TTL_MS = 5 * 60 * 1000 // 5 minutes, single use

/**
 * Called from the consent screen (app/oauth/authorize/page.tsx) after the
 * user is logged in and clicks "Allow". Mints a one-time authorization code
 * bound to the user's current Supabase session, then hands back the
 * redirect_uri to send the browser to.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return Response.json({ error: 'invalid_request' }, { status: 400 })

  const {
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod = 'S256',
    supabase_access_token: supabaseAccessToken,
    supabase_refresh_token: supabaseRefreshToken,
  } = body

  if (!clientId || !redirectUri || !codeChallenge || !supabaseAccessToken || !supabaseRefreshToken) {
    return Response.json({ error: 'invalid_request' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: client } = await admin
    .from('oauth_clients')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    return Response.json({ error: 'invalid_client_or_redirect_uri' }, { status: 400 })
  }

  // Confirm the supplied Supabase access token really is a valid, live session.
  const anon = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userData, error: userError } = await anon.auth.getUser(supabaseAccessToken)
  if (userError || !userData.user) {
    return Response.json({ error: 'invalid_session' }, { status: 401 })
  }
  if (!isEmailAllowed(userData.user.email)) {
    return Response.json(
      { error: 'access_denied', error_description: "Questo account non e abilitato per l'integrazione AI" },
      { status: 403 }
    )
  }

  const code = randomToken(32)
  const now = Date.now()
  const { error } = await admin.from('oauth_codes').insert({
    code,
    client_id: clientId,
    user_id: userData.user.id,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    supabase_access_token: supabaseAccessToken,
    supabase_refresh_token: supabaseRefreshToken,
    supabase_expires_at: new Date(now + 55 * 60 * 1000).toISOString(),
    expires_at: new Date(now + CODE_TTL_MS).toISOString(),
  })
  if (error) {
    return Response.json({ error: 'server_error', error_description: error.message }, { status: 500 })
  }

  const redirect = new URL(redirectUri)
  redirect.searchParams.set('code', code)
  if (body.state) redirect.searchParams.set('state', body.state)

  return Response.json({ redirect_url: redirect.toString() })
}
