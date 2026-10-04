import type { SupabaseClient } from '@supabase/supabase-js'
import { randomToken } from '@/lib/oauth/pkce'
import { isEmailAllowed } from '@/lib/oauth/allowlist'
import { jwtExpiryMs, mintIndependentSession } from '@/lib/oauth/independentSession'

const CODE_TTL_MS = 5 * 60 * 1000 // 5 minutes, single use

export interface AuthorizeDeps {
  /** Service-role client (oauth_* tables + auth.admin.generateLink). */
  admin: SupabaseClient
  /** Returns a fresh anon client (no persisted session, no auto refresh). */
  anon: () => SupabaseClient
  now?: () => number
}

/**
 * Logic behind POST /api/oauth/authorize (see that route for the contract).
 * Mints a one-time authorization code bound to a Supabase session created
 * exclusively for the AI client, independent of the browser's session.
 */
export async function handleAuthorizeRequest(req: Request, deps: AuthorizeDeps): Promise<Response> {
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

  const { admin } = deps
  const now = (deps.now ?? Date.now)()

  const { data: client } = await admin
    .from('oauth_clients')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    return Response.json({ error: 'invalid_client_or_redirect_uri' }, { status: 400 })
  }

  // Confirm the supplied Supabase access token really is a valid, live session.
  const { data: userData, error: userError } = await deps.anon().auth.getUser(supabaseAccessToken)
  if (userError || !userData.user) {
    return Response.json({ error: 'invalid_session' }, { status: 401 })
  }
  if (!isEmailAllowed(userData.user.email)) {
    console.warn('[mcp-auth] email not allowed (authorize)')
    return Response.json(
      { error: 'access_denied', error_description: "Questo account non e abilitato per l'integrazione AI" },
      { status: 403 }
    )
  }

  // Give the AI client its own Supabase session (own refresh-token family), so
  // refresh-token rotation on either side never logs the other one out.
  let sessionTokens: { accessToken: string; refreshToken: string; expiresAtMs: number }
  const minted = await mintIndependentSession(admin, deps.anon(), userData.user.email)
  if (minted) {
    sessionTokens = minted
  } else {
    console.warn('[mcp-auth] independent session unavailable, using shared browser session (fallback)')
    sessionTokens = {
      accessToken: supabaseAccessToken,
      refreshToken: supabaseRefreshToken,
      // Real expiry of the browser token, never a guess; undecodable -> treat
      // as already expired so the first MCP call refreshes it.
      expiresAtMs: jwtExpiryMs(supabaseAccessToken) ?? now,
    }
  }

  const code = randomToken(32)
  const { error } = await admin.from('oauth_codes').insert({
    code,
    client_id: clientId,
    user_id: userData.user.id,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    supabase_access_token: sessionTokens.accessToken,
    supabase_refresh_token: sessionTokens.refreshToken,
    supabase_expires_at: new Date(sessionTokens.expiresAtMs).toISOString(),
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
