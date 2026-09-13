import { requireAuth } from '@/lib/oauth/requireAuth'
import { listTransactions } from '@/lib/ai-data'

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) return auth.response

  const url = new URL(req.url)
  const walletSlug = url.searchParams.get('wallet') || undefined
  const type = url.searchParams.get('type')
  const since = url.searchParams.get('since') || undefined
  const limitParam = url.searchParams.get('limit')

  const transactions = await listTransactions(auth.session.supabase, {
    walletSlug,
    type: type === 'income' || type === 'expense' ? type : undefined,
    since,
    limit: limitParam ? Math.min(Number(limitParam) || 50, 500) : 100,
  })

  return Response.json({ transactions })
}
