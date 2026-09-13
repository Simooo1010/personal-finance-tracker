import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod'
import { verifyBearerToken, type VerifiedSession } from '@/lib/oauth/verifyToken'
import { getWalletBalancesById, listTransactions, getFinancialSummary } from '@/lib/ai-data'

function sessionFrom(extra: { authInfo?: { extra?: Record<string, unknown> } }): VerifiedSession {
  const session = extra.authInfo?.extra?.session as VerifiedSession | undefined
  if (!session) throw new Error('Missing authenticated session')
  return session
}

function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

const handler = createMcpHandler((server) => {
  server.registerTool(
    'list_wallets',
    {
      title: 'List wallets',
      description: "List the user's wallets with their current balances.",
    },
    async (extra) => jsonResult(await getWalletBalancesById(sessionFrom(extra).supabase))
  )

  server.registerTool(
    'list_transactions',
    {
      title: 'List transactions',
      description: 'List transactions, optionally filtered by wallet slug, type, or a since date.',
      inputSchema: {
        wallet: z.string().optional().describe('Wallet slug to filter by'),
        type: z.enum(['income', 'expense']).optional(),
        since: z.string().optional().describe('ISO date/time; only transactions on or after this date'),
        limit: z.number().int().min(1).max(500).optional(),
      },
    },
    async (args, extra) =>
      jsonResult(
        await listTransactions(sessionFrom(extra).supabase, {
          walletSlug: args.wallet,
          type: args.type,
          since: args.since,
          limit: args.limit ?? 100,
        })
      )
  )

  server.registerTool(
    'get_financial_summary',
    {
      title: 'Get financial summary',
      description: 'Get net worth, per-wallet balances, and active debts/credits.',
    },
    async (extra) => jsonResult(await getFinancialSummary(sessionFrom(extra).supabase))
  )
}, {}, { basePath: '/api' })

const authHandler = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined
    const session = await verifyBearerToken(bearerToken)
    if (!session) return undefined
    return {
      token: bearerToken,
      clientId: session.clientId,
      scopes: ['read'],
      extra: { session },
    }
  },
  { required: true, requiredScopes: [] }
)

export { authHandler as GET, authHandler as POST, authHandler as DELETE }
