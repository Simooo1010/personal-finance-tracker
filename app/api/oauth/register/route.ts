import { createAdminClient } from '@/lib/supabaseAdmin'
import { randomToken } from '@/lib/oauth/pkce'

// RFC 7591 — Dynamic Client Registration. Claude and ChatGPT both register
// themselves automatically the first time a user adds this as a connector,
// so no manual client setup is needed.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const redirectUris: string[] = Array.isArray(body.redirect_uris) ? body.redirect_uris : []

  if (redirectUris.length === 0) {
    return Response.json({ error: 'invalid_client_metadata', error_description: 'redirect_uris is required' }, { status: 400 })
  }
  for (const uri of redirectUris) {
    try {
      const u = new URL(uri)
      if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
        return Response.json({ error: 'invalid_redirect_uri' }, { status: 400 })
      }
    } catch {
      return Response.json({ error: 'invalid_redirect_uri' }, { status: 400 })
    }
  }

  const clientId = randomToken(16)
  // Public clients (MCP/ChatGPT native OAuth flows) rely on PKCE, not a
  // secret. We still issue one so confidential clients (token_endpoint_auth
  // = client_secret_post) can use it if they want to.
  const clientSecret = randomToken(24)

  const admin = createAdminClient()
  const { error } = await admin.from('oauth_clients').insert({
    client_id: clientId,
    client_secret: clientSecret,
    client_name: typeof body.client_name === 'string' ? body.client_name.slice(0, 200) : null,
    redirect_uris: redirectUris,
  })
  if (error) {
    return Response.json({ error: 'server_error', error_description: error.message }, { status: 500 })
  }

  return Response.json(
    {
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    },
    { status: 201 }
  )
}
