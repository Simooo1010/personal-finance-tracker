import { getBaseUrl } from '@/lib/oauth/baseUrl'

// RFC 9728 — lets an MCP client that got a 401 from /api/mcp discover which
// authorization server to use.
export async function GET(req: Request) {
  const base = getBaseUrl(req)
  return Response.json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: ['read'],
    bearer_methods_supported: ['header'],
  })
}
