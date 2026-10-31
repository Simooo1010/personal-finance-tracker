import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * The signed-in user from the locally stored session. Unlike auth.getUser() this makes
 * no network request, so it is safe to call on every mount and before every save.
 * Authorization is still enforced server-side by RLS.
 */
export async function getLocalUser(client: ReturnType<typeof createClient> = createClient()) {
  const { data: { session } } = await client.auth.getSession()
  return session?.user ?? null
}
