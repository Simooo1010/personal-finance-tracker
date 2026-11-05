import { createAdminClient } from '@/lib/supabaseAdmin'
import { randomToken } from '@/lib/oauth/pkce'
import { oauthNoStore, oauthString, readOAuthBody, redirectUriSchema } from '@/lib/oauth/request'
import { z } from 'zod'

const registrationSchema = z.object({
  redirect_uris: z.array(redirectUriSchema).min(1).max(20),
  client_name: oauthString(200).optional(),
  token_endpoint_auth_method: z.enum(['none', 'client_secret_post']).default('client_secret_post'),
  grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])).optional(),
  response_types: z.array(z.literal('code')).optional(),
})

// RFC 7591 — Dynamic Client Registration. Claude and ChatGPT both register
// themselves automatically the first time a user adds this as a connector,
// so no manual client setup is needed.
export async function POST(req: Request) {
  const parsed = registrationSchema.safeParse(await readOAuthBody(req))
  if (!parsed.success) {
    const error = parsed.error.issues.some(issue => issue.path[0] === 'redirect_uris' && issue.path.length > 1)
      ? 'invalid_redirect_uri'
      : 'invalid_client_metadata'
    return Response.json({ error }, { status: 400 })
  }

  const { redirect_uris: redirectUris, client_name: clientName, token_endpoint_auth_method: method } = parsed.data
  const clientId = randomToken(16)
  const clientSecret = method === 'client_secret_post' ? randomToken(24) : null

  const admin = createAdminClient()
  const { error } = await admin.from('oauth_clients').insert({
    client_id: clientId,
    client_secret: clientSecret,
    client_name: clientName ?? null,
    redirect_uris: redirectUris,
  })
  if (error) {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json(
    {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: method,
    },
    { status: 201, headers: oauthNoStore }
  )
}
