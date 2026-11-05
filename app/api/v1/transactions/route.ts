import { requireAuth } from '@/lib/oauth/requireAuth'
import { listTransactions } from '@/lib/ai-data'
import { parseSince } from '@/lib/ai-data/dates'

const ISO_DATE_OR_INSTANT = /^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/i

function invalidQuery(field: string) {
  return Response.json({ error: 'invalid_query', field }, { status: 400 })
}

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) return auth.response

  const params = new URL(req.url).searchParams
  for (const field of ['wallet', 'type', 'since', 'limit']) {
    if (params.getAll(field).length > 1) return invalidQuery(field)
  }

  const walletSlug = params.get('wallet') ?? undefined
  const type = params.get('type') ?? undefined
  const since = params.get('since') ?? undefined
  const limitParam = params.get('limit')
  const limit = limitParam === null ? 100 : Number(limitParam)
  if (walletSlug !== undefined && !/^[A-Za-z0-9_-]+$/.test(walletSlug)) return invalidQuery('wallet')
  if (type !== undefined && type !== 'income' && type !== 'expense') return invalidQuery('type')
  if (limitParam !== null && (!/^\d{1,3}$/.test(limitParam) || limit < 1 || limit > 500)) {
    return invalidQuery('limit')
  }
  if (since !== undefined) {
    if (!ISO_DATE_OR_INSTANT.test(since)) return invalidQuery('since')
    try {
      // The date portion is checked separately because Date.parse normalizes some invalid days.
      parseSince(since.slice(0, 10))
      parseSince(since)
    } catch {
      return invalidQuery('since')
    }
  }

  try {
    const transactions = await listTransactions(auth.session.db, { walletSlug, type, since, limit })
    return Response.json({ transactions })
  } catch {
    return Response.json({ error: 'internal_error' }, { status: 500 })
  }
}
