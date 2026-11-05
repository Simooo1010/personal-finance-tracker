import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { codeChallengeSchema, randomToken } from '@/lib/oauth/pkce'
import { isEmailAllowed } from '@/lib/oauth/allowlist'
import { mintIndependentSession } from '@/lib/oauth/independentSession'
import { clientIdSchema, oauthNoStore, readOAuthBody, redirectUriSchema } from '@/lib/oauth/request'

const CODE_TTL_MS = 5 * 60 * 1000 // 5 minutes, single use

const consentSchema = z.object({
  client_id: clientIdSchema,
  redirect_uri: redirectUriSchema,
  code_challenge: codeChallengeSchema,
  code_challenge_method: z.literal('S256').default('S256'),
  state: z.string().max(2048).optional(),
  supabase_access_token: z.string().min(1).max(16 * 1024).regex(/^[A-Za-z0-9_.-]+$/),
  decision: z.enum(['allow', 'deny']).default('allow'),
})

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
  const parsed = consentSchema.safeParse(await readOAuthBody(req))
  if (!parsed.success) return Response.json({ error: 'invalid_request' }, { status: 400 })

  const {
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    supabase_access_token: supabaseAccessToken,
    decision,
    state,
  } = parsed.data

  const { admin } = deps
  const now = (deps.now ?? Date.now)()

  const { data: client, error: lookupError } = await admin
    .from('oauth_clients')
    .select('redirect_uris')
    .eq('client_id', clientId)
    .maybeSingle()
  if (lookupError) return Response.json({ error: 'server_error' }, { status: 500 })
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    return Response.json({ error: 'invalid_client_or_redirect_uri' }, { status: 400 })
  }

  // Confirm the supplied Supabase access token really is a valid, live session.
  const verified = await deps.anon().auth.getUser(supabaseAccessToken).catch(() => null)
  const status = verified?.error?.status
  if (!verified || status === 0 || status === 429 || (status !== undefined && status >= 500)) {
    return Response.json({ error: 'temporarily_unavailable' }, { status: 503 })
  }
  const { data: userData, error: userError } = verified
  if (userError || !userData?.user) {
    return Response.json({ error: 'invalid_session' }, { status: 401 })
  }

  const redirect = new URL(redirectUri)
  if (state) redirect.searchParams.set('state', state)
  if (decision === 'deny') {
    redirect.searchParams.set('error', 'access_denied')
    return Response.json({ redirect_url: redirect.toString() }, { headers: oauthNoStore })
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
  const sessionTokens = await mintIndependentSession(admin, deps.anon(), userData.user)
  if (!sessionTokens) {
    return Response.json({ error: 'temporarily_unavailable' }, { status: 503 })
  }

  const code = randomToken(32)
  const { error } = await admin.from('oauth_codes').insert({
    code,
    client_id: clientId,
    user_id: userData.user.id,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    supabase_access_token: sessionTokens.accessToken,
    supabase_refresh_token: sessionTokens.refreshToken,
    supabase_expires_at: new Date(sessionTokens.expiresAtMs).toISOString(),
    expires_at: new Date(now + CODE_TTL_MS).toISOString(),
  })
  if (error) {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  redirect.searchParams.set('code', code)

  return Response.json({ redirect_url: redirect.toString() }, { headers: oauthNoStore })
}
