import { createAdminClient } from '@/lib/supabaseAdmin'
import { handleTokenRequest } from '@/lib/oauth/tokenHandler'

/** OAuth token endpoint (authorization_code + refresh_token). See lib/oauth/tokenHandler.ts. */
export async function POST(req: Request) {
  return handleTokenRequest(req, { admin: createAdminClient() })
}
