import type { SupabaseClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { codeVerifierSchema, randomToken, verifyPkce } from '@/lib/oauth/pkce'
import { clientIdSchema, oauthNoStore, oauthString, readOAuthBody, redirectUriSchema } from '@/lib/oauth/request'

const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

const clientSchema = z.object({ client_id: clientIdSchema, client_secret: oauthString(256).optional() })
const codeGrantSchema = clientSchema.extend({
  grant_type: z.literal('authorization_code'),
  code: oauthString(256),
  redirect_uri: redirectUriSchema,
  code_verifier: codeVerifierSchema,
})
const refreshGrantSchema = clientSchema.extend({
  grant_type: z.literal('refresh_token'),
  refresh_token: oauthString(256),
})
const grantSchema = z.discriminatedUnion('grant_type', [codeGrantSchema, refreshGrantSchema])

export interface TokenDeps {
  /** Service-role client (oauth_* tables only). */
  admin: SupabaseClient
  now?: () => number
}

function errorResponse(error: string, status = 400) {
  return Response.json({ error }, { status, headers: oauthNoStore })
}

function tokenResponse(accessToken: string, refreshToken: string) {
  return Response.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope: 'read',
  }, { headers: oauthNoStore })
}

function clientSecretMatches(stored: string | null, provided?: string): boolean {
  if (stored === null) return provided === undefined
  if (!provided) return false
  const expected = Buffer.from(stored)
  const actual = Buffer.from(provided)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** Logic behind POST /api/oauth/token (authorization_code + refresh_token grants). */
export async function handleTokenRequest(req: Request, deps: TokenDeps): Promise<Response> {
  const body = await readOAuthBody(req, true)
  if (!body || typeof body.grant_type !== 'string' || !body.grant_type) return errorResponse('invalid_request')
  if (body.grant_type !== 'authorization_code' && body.grant_type !== 'refresh_token') {
    return errorResponse('unsupported_grant_type')
  }
  const parsed = grantSchema.safeParse(body)
  if (!parsed.success || req.headers.has('authorization')) return errorResponse('invalid_request')

  try {
    return await exchangeGrant(parsed.data, deps)
  } catch {
    return errorResponse('server_error', 500)
  }
}

async function exchangeGrant(params: z.infer<typeof grantSchema>, deps: TokenDeps): Promise<Response> {
  const { admin } = deps
  const { client_id: clientId, client_secret: clientSecret } = params
  const { data: client, error: clientError } = await admin
    .from('oauth_clients')
    .select('client_secret')
    .eq('client_id', clientId)
    .maybeSingle()
  if (clientError) return errorResponse('server_error', 500)
  if (!client || !clientSecretMatches(client.client_secret, clientSecret)) return errorResponse('invalid_client')

  const now = (deps.now ?? Date.now)()
  const accessToken = randomToken(32)
  const refreshToken = randomToken(32)
  const tokenPair = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: new Date(now + ACCESS_TOKEN_TTL_MS).toISOString(),
  }

  if (params.grant_type === 'authorization_code') {
    const { code, redirect_uri: redirectUri, code_verifier: codeVerifier } = params
    const { data: codeRow, error: codeError } = await admin.from('oauth_codes')
      .select('code_challenge, code_challenge_method')
      .eq('code', code)
      .eq('client_id', clientId)
      .eq('redirect_uri', redirectUri)
      .eq('used', false)
      .gt('expires_at', new Date(now).toISOString())
      .maybeSingle()
    if (codeError) return errorResponse('server_error', 500)
    if (!codeRow || !verifyPkce(codeVerifier, codeRow.code_challenge, codeRow.code_challenge_method)) {
      return errorResponse('invalid_grant')
    }

    // A conditional UPDATE gives only one concurrent caller permission to
    // mint. The insert is a separate statement. If it fails, the code remains
    // consumed because the outcome of a network failure can be ambiguous.
    const { data: claimed, error: claimError } = await admin.from('oauth_codes')
      .update({ used: true })
      .eq('code', code)
      .eq('client_id', clientId)
      .eq('redirect_uri', redirectUri)
      .eq('code_challenge', codeRow.code_challenge)
      .eq('code_challenge_method', 'S256')
      .eq('used', false)
      .gt('expires_at', new Date((deps.now ?? Date.now)()).toISOString())
      .select('user_id, supabase_access_token, supabase_refresh_token, supabase_expires_at')
      .maybeSingle()
    if (claimError) return errorResponse('server_error', 500)
    if (!claimed) return errorResponse('invalid_grant')

    const { error } = await admin.from('oauth_tokens').insert({
      ...tokenPair,
      client_id: clientId,
      user_id: claimed.user_id,
      supabase_access_token: claimed.supabase_access_token,
      supabase_refresh_token: claimed.supabase_refresh_token,
      supabase_expires_at: claimed.supabase_expires_at,
    })
    if (error) return errorResponse('server_error', 500)
  } else {
    // Preserve the row's underlying Supabase session. Only the registered
    // client holding the current opaque refresh token can rotate the pair.
    const { data: updated, error } = await admin
      .from('oauth_tokens')
      .update(tokenPair)
      .eq('refresh_token', params.refresh_token)
      .eq('client_id', clientId)
      .select('access_token')
      .maybeSingle()
    if (error) return errorResponse('server_error', 500)
    if (!updated) return errorResponse('invalid_grant')
  }

  return tokenResponse(accessToken, refreshToken)
}
