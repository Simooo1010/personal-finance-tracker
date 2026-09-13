import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role client. ONLY use this for the oauth_* bookkeeping tables
 * (supabase_migration_oauth.sql), which hold no financial data and have no
 * RLS policies of their own. Never use this to read wallets/transactions —
 * those must always go through a user-scoped client so RLS keeps doing the
 * authorization work.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) is not configured')
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
