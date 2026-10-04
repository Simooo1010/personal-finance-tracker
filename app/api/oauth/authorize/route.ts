import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { handleAuthorizeRequest } from '@/lib/oauth/authorizeHandler'

/**
 * Called from the consent screen (app/oauth/authorize/page.tsx) after the
 * user is logged in and clicks "Allow". Verifies the browser's Supabase
 * session (and the account allowlist), mints a separate Supabase session for
 * the AI client, stores it with a one-time authorization code, then hands
 * back the redirect_uri to send the browser to. See lib/oauth/authorizeHandler.ts.
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
