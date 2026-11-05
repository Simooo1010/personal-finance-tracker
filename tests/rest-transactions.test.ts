import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../app/api/v1/transactions/route'

const { requireAuth, listTransactions } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  listTransactions: vi.fn(),
}))
vi.mock('@/lib/oauth/requireAuth', () => ({ requireAuth }))
vi.mock('@/lib/ai-data', () => ({ listTransactions }))

function request(query = '') {
  return new Request(`http://localhost/api/v1/transactions${query}`)
}

beforeEach(() => {
  vi.resetAllMocks()
  requireAuth.mockResolvedValue({ session: { db: {} } })
  listTransactions.mockResolvedValue([])
})

describe('REST transaction filters', () => {
  it.each([
    '?limit=0', '?limit=-1', '?limit=2.5', '?limit=501', '?limit=NaN',
    '?limit=2&limit=3', '?type=credit', '?wallet=%5Bcash%5D', '?since=2025-02-30',
    '?since=2025-02-30T00:00:00Z', '?since=2025-01-02T00:00:00',
  ])('rejects %s before reading the ledger', async (query) => {
    expect((await GET(request(query))).status).toBe(400)
    expect(listTransactions).not.toHaveBeenCalled()
  })

  it('forwards valid filters and preserves the response shape', async () => {
    const response = await GET(request('?wallet=savings&type=income&since=2025-03-30&limit=50'))
    expect(await response.json()).toEqual({ transactions: [] })
    expect(listTransactions).toHaveBeenCalledWith({}, {
      walletSlug: 'savings', type: 'income', since: '2025-03-30', limit: 50,
    })
  })

  it('keeps the existing default and accepts a timestamp with an offset', async () => {
    const since = '2025-03-30T01:30:00.123456+01:00'
    expect((await GET(request(`?since=${encodeURIComponent(since)}`))).status).toBe(200)
    expect(listTransactions).toHaveBeenCalledWith({}, expect.objectContaining({ since, limit: 100 }))
  })

  it('preserves authorization errors', async () => {
    requireAuth.mockResolvedValue({ response: new Response(null, { status: 401 }) })
    expect((await GET(request('?limit=-1'))).status).toBe(401)
    expect(listTransactions).not.toHaveBeenCalled()
  })

  it('returns a generic error if the ledger cannot be read', async () => {
    listTransactions.mockRejectedValue(new Error('private database details'))
    const response = await GET(request())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'internal_error' })
  })
})
