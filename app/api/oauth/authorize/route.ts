import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { handleAuthorizeRequest } from '@/lib/oauth/authorizeHandler'

/**
 * Called from the consent screen (app/oauth/authorize/page.tsx) after the
 * user makes a decision. Both decisions check the registered callback and
 * browser session. Only an allowlisted user's approval mints an independent
 * Supabase session and one-time code. See lib/oauth/authorizeHandler.ts.
 */
export async function POST(req: Request) {
  return handleAuthorizeRequest(req, {
    admin: createAdminClient(),
    anon: () =>
      createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
  })
}
