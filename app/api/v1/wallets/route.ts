import { requireAuth } from '@/lib/oauth/requireAuth'
import { getWalletBalancesById } from '@/lib/ai-data'

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) return auth.response

  const wallets = await getWalletBalancesById(auth.session.supabase)
  return Response.json({ wallets })
}
