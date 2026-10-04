import { requireAuth } from '@/lib/oauth/requireAuth'
import { getFinancialSummary } from '@/lib/ai-data'

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) return auth.response

  const summary = await getFinancialSummary(auth.session.db)
  return Response.json(summary)
}
