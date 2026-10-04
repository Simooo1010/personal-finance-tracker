import type { SupabaseClient } from '@supabase/supabase-js'
import { randomToken, verifyPkce } from '@/lib/oauth/pkce'

const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export interface TokenDeps {
  /** Service-role client (oauth_* tables only). */
  admin: SupabaseClient
  now?: () => number
}

async function readParams(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return (await req.json().catch(() => ({}))) as Record<string, string>
  }
  const form = await req.formData()
  const out: Record<string, string> = {}
  form.forEach((v, k) => { out[k] = String(v) })
  return out
}

function errorResponse(error: string, description?: string, status = 400) {
  return Response.json({ error, error_description: description }, { status })
}

function tokenResponse(accessToken: string, refreshToken: string) {
  return Response.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope: 'read',
  })
}

/** Logic behind POST /api/oauth/token (authorization_code + refresh_token grants). */
export async function handleTokenRequest(req: Request, deps: TokenDeps): Promise<Response> {
  const params = await readParams(req)
  const { admin } = deps
  const now = (deps.now ?? Date.now)()

  if (params.grant_type === 'authorization_code') {
    const { code, redirect_uri: redirectUri, code_verifier: codeVerifier, client_id: clientId } = params
    if (!code || !redirectUri || !codeVerifier) return errorResponse('invalid_request')

    const { data: codeRow } = await admin.from('oauth_codes').select('*').eq('code', code).maybeSingle()
    if (!codeRow || codeRow.used) return errorResponse('invalid_grant', 'Unknown or already-used code')
    if (new Date(codeRow.expires_at).getTime() < now) return errorResponse('invalid_grant', 'Code expired')
    if (codeRow.redirect_uri !== redirectUri) return errorResponse('invalid_grant', 'redirect_uri mismatch')
    if (clientId && codeRow.client_id !== clientId) return errorResponse('invalid_grant', 'client_id mismatch')
    if (!verifyPkce(codeVerifier, codeRow.code_challenge, codeRow.code_challenge_method)) {
      return errorResponse('invalid_grant', 'PKCE verification failed')
    }

    await admin.from('oauth_codes').update({ used: true }).eq('code', code)

    const accessToken = randomToken(32)
    const refreshToken = randomToken(32)
    const { error } = await admin.from('oauth_tokens').insert({
      access_token: accessToken,
      refresh_token: refreshToken,
      client_id: codeRow.client_id,
      user_id: codeRow.user_id,
      supabase_access_token: codeRow.supabase_access_token,
      supabase_refresh_token: codeRow.supabase_refresh_token,
      supabase_expires_at: codeRow.supabase_expires_at,
      expires_at: new Date(now + ACCESS_TOKEN_TTL_MS).toISOString(),
    })
    if (error) return errorResponse('server_error', error.message, 500)

    return tokenResponse(accessToken, refreshToken)
  }

  if (params.grant_type === 'refresh_token') {
    const { refresh_token: refreshToken } = params
    if (!refreshToken) return errorResponse('invalid_request')

    // Rotate the opaque pair IN PLACE: the row (and with it the single stored
    // copy of the Supabase session, which verifyToken keeps refreshed) stays
    // the same; only our own access/refresh tokens change. Matching on the old
    // refresh_token makes this an atomic compare-and-swap: an unknown or
    // already-rotated refresh token updates nothing and gets invalid_grant.
    const newAccessToken = randomToken(32)
    const newRefreshToken = randomToken(32)
    const { data: updated, error: updateError } = await admin
      .from('oauth_tokens')
      .update({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_at: new Date(now + ACCESS_TOKEN_TTL_MS).toISOString(),
      })
      .eq('refresh_token', refreshToken)
      .select('access_token')
    if (updateError) return errorResponse('server_error', updateError.message, 500)
    if (!Array.isArray(updated) || updated.length !== 1) {
      return errorResponse('invalid_grant', 'Unknown refresh token')
    }

    return tokenResponse(newAccessToken, newRefreshToken)
  }

  return errorResponse('unsupported_grant_type')
}
