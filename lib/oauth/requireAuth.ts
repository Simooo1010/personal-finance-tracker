import { extractBearerToken, verifyBearerToken, type VerifiedSession } from './verifyToken'
import { getBaseUrl } from './baseUrl'

export async function requireAuth(req: Request): Promise<{ session: VerifiedSession } | { response: Response }> {
  const token = extractBearerToken(req)
  const wwwAuthenticate = `Bearer resource_metadata="${getBaseUrl(req)}/.well-known/oauth-protected-resource"`

  if (!token) {
    return {
      response: Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'WWW-Authenticate': wwwAuthenticate } }),
    }
  }

  const session = await verifyBearerToken(token)
  if (!session) {
    return {
      response: Response.json({ error: 'invalid_token' }, { status: 401, headers: { 'WWW-Authenticate': wwwAuthenticate } }),
    }
  }

  return { session }
}
