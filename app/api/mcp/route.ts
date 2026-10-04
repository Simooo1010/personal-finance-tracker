import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod'
import { verifyBearerToken, type VerifiedSession } from '@/lib/oauth/verifyToken'
import { getWalletBalancesById, listTransactions, getFinancialSummary } from '@/lib/ai-data'
import {
  searchTransactions,
  getTransactionById,
  getPeriodStats,
  getSpendingBreakdown,
  getMonthlyCashflow,
  listDebts,
  listTransfers,
  getWalletDetail,
} from '@/lib/ai-data/transactions'
import { listChatSessions, getChatMessages, searchChatMessages, MESSAGES_MAX_LIMIT } from '@/lib/ai-data/chat'
import {
  getAiMemory,
  getAiAnalysis,
  listActionLog,
  ACTION_LOG_MAX_LIMIT,
  ACTION_LOG_PAYLOAD_DEFAULT_LIMIT,
  ACTION_LOG_PAYLOAD_MAX_LIMIT,
} from '@/lib/ai-data/meta'
import { describeData, queryData } from '@/lib/ai-data/generic'

type ToolExtra = { authInfo?: { extra?: Record<string, unknown> } }

function sessionFrom(extra: ToolExtra): VerifiedSession {
  const session = extra.authInfo?.extra?.session as VerifiedSession | undefined
  if (!session) throw new Error('Missing authenticated session')
  return session
}

// Global output cap: compact JSON, and anything larger than this is replaced by a
// truncated preview so a single tool call can't flood the client's context.
const MAX_OUTPUT_CHARS = 100_000
const PREVIEW_CHARS = 90_000

function jsonResult(data: unknown) {
  let text = JSON.stringify(data) ?? 'null'
  if (text.length > MAX_OUTPUT_CHARS) {
    text = JSON.stringify({
      truncated: true,
      note: 'Response too large; narrow filters or page with limit/offset',
      preview: text.slice(0, PREVIEW_CHARS),
    })
  }
  return { content: [{ type: 'text' as const, text }] }
}

// Every tool is read-only. AI code only ever receives session.db (ReadOnlyDb).
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const iso = z
  .string()
  .describe(
    "ISO 8601 date/time. A date-only value (YYYY-MM-DD) is a whole day in Europe/Rome: as 'until' it includes that entire day."
  )
const DEBT_SEMANTICS =
  ' Transfers between wallets are excluded. Debts: active by_me (the user borrowed) counts as income, active to_me (the user lent) counts as expense, completed debts count 0; pass include_debts=false to skip debt rows entirely.'
const page = {
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
}

const handler = createMcpHandler((server) => {
  server.registerTool(
    'list_wallets',
    {
      title: 'List wallets',
      description: "List the user's wallets with their current balances.",
      annotations: READ_ONLY,
    },
    async (extra) => jsonResult(await getWalletBalancesById(sessionFrom(extra).db))
  )

  server.registerTool(
    'list_transactions',
    {
      title: 'List transactions',
      description: 'List transactions, optionally filtered by wallet slug, type, or a since date. For richer filtering and pagination use search_transactions.',
      annotations: READ_ONLY,
      inputSchema: {
        wallet: z.string().optional().describe('Wallet slug to filter by'),
        type: z.enum(['income', 'expense']).optional(),
        since: z.string().optional().describe('ISO date/time; only transactions on or after this date'),
        limit: z.number().int().min(1).max(500).optional(),
      },
    },
    async (args, extra) =>
      jsonResult(
        await listTransactions(sessionFrom(extra).db, {
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
      annotations: READ_ONLY,
    },
    async (extra) => jsonResult(await getFinancialSummary(sessionFrom(extra).db))
  )

  // Helper for the read-only tools below: validates args with zod, hands the handler the read-only db.
  const tool = <S extends z.ZodRawShape>(
    name: string,
    title: string,
    description: string,
    inputSchema: S,
    run: (args: z.infer<z.ZodObject<S>>, db: VerifiedSession['db']) => Promise<unknown>
  ) =>
    server.registerTool(
      name,
      { title, description, inputSchema, annotations: READ_ONLY },
      (async (args: z.infer<z.ZodObject<S>>, extra: ToolExtra) =>
        jsonResult(await run(args, sessionFrom(extra).db))) as never
    )

  tool(
    'search_transactions',
    'Search transactions',
    'Search/paginate transactions. Filter by text (title, debt person/description), wallet slug, type, date range, amount range. Excludes internal transfers by default.',
    {
      query: z.string().optional(),
      wallet: z.string().optional(),
      type: z.enum(['income', 'expense']).optional(),
      since: iso.optional(),
      until: iso.optional(),
      min_amount: z.number().optional(),
      max_amount: z.number().optional(),
      include_transfers: z.boolean().optional(),
      include_debts: z.boolean().optional(),
      sort: z.enum(['date_desc', 'date_asc', 'amount_desc', 'amount_asc']).optional(),
      ...page,
    },
    (a, db) =>
      searchTransactions(db, {
        query: a.query,
        walletSlug: a.wallet,
        type: a.type,
        since: a.since,
        until: a.until,
        minAmount: a.min_amount,
        maxAmount: a.max_amount,
        includeTransfers: a.include_transfers,
        includeDebts: a.include_debts,
        sort: a.sort,
        limit: a.limit,
        offset: a.offset,
      })
  )

  tool('get_transaction', 'Get transaction', 'Get one transaction by id with parsed debt/transfer metadata.',
    { id: z.string() },
    (a, db) => getTransactionById(db, a.id))

  tool(
    'get_period_stats',
    'Period statistics',
    'Income, expense, net and savings rate for a date range, optionally for one wallet, with per-wallet breakdown.' +
      DEBT_SEMANTICS,
    {
      since: iso.optional(),
      until: iso.optional(),
      wallet: z.string().optional(),
      include_debts: z.boolean().optional().describe('Default true'),
    },
    (a, db) =>
      getPeriodStats(db, { since: a.since, until: a.until, walletSlug: a.wallet, includeDebts: a.include_debts })
  )

  tool(
    'get_spending_breakdown',
    'Spending breakdown',
    'Expense totals grouped by wallet or by transaction title (transactions have no category column), with share of total.',
    {
      group_by: z.enum(['wallet', 'title']),
      since: iso.optional(),
      until: iso.optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
    (a, db) => getSpendingBreakdown(db, { groupBy: a.group_by, since: a.since, until: a.until, limit: a.limit })
  )

  tool('get_monthly_cashflow', 'Monthly cashflow',
    'Income/expense/net per calendar month (Europe/Rome) for the last N months including the current one (default 12, max 60).' +
      DEBT_SEMANTICS,
    {
      months: z.number().int().min(1).max(60).optional(),
      wallet: z.string().optional(),
      include_debts: z.boolean().optional().describe('Default true'),
    },
    (a, db) => getMonthlyCashflow(db, { months: a.months, walletSlug: a.wallet, includeDebts: a.include_debts }))

  tool(
    'list_debts',
    'List debts and credits',
    'Debts/credits with person, amount, status. direction: to_me = someone owes the user, by_me = the user owes.',
    {
      status: z.enum(['active', 'completed']).optional(),
      direction: z.enum(['to_me', 'by_me']).optional(),
      person: z.string().optional(),
    },
    (a, db) => listDebts(db, a)
  )

  tool('list_transfers', 'List wallet transfers',
    'Internal wallet-to-wallet transfers (hidden from list_transactions).',
    { since: iso.optional(), until: iso.optional(), limit: z.number().int().min(1).max(500).optional() },
    (a, db) => listTransfers(db, a))

  tool('get_wallet', 'Get wallet',
    'One wallet by slug with balance, transaction count and first/last transaction dates.',
    { slug: z.string() },
    (a, db) => getWalletDetail(db, a.slug))

  tool('list_chat_sessions', 'List chat sessions',
    "The user's in-app AI assistant conversations (newest first).",
    { limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional() },
    (a, db) => listChatSessions(db, a))

  tool('get_chat_messages', 'Get chat messages', 'Messages of one in-app chat session, paginated (default 50, max 100).',
    {
      session_id: z.string(),
      order: z.enum(['asc', 'desc']).optional(),
      limit: z.number().int().min(1).max(MESSAGES_MAX_LIMIT).optional(),
      offset: z.number().int().min(0).optional(),
    },
    (a, db) => getChatMessages(db, a.session_id, { order: a.order, limit: a.limit, offset: a.offset }))

  tool('search_chat_messages', 'Search chat messages', 'Text search across all in-app chat messages.',
    {
      query: z.string().min(1),
      role: z.enum(['user', 'assistant']).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    (a, db) => searchChatMessages(db, a))

  tool('get_ai_memory', 'Get AI memory', 'Long-term notes the in-app assistant keeps about the user.', {},
    (_a, db) => getAiMemory(db))

  tool('get_ai_analysis', 'Get AI analysis', 'The latest saved AI financial analysis report with timestamps.', {},
    (_a, db) => getAiAnalysis(db))

  tool(
    'list_action_log',
    'List action log',
    `Audit trail of user actions (add/edit/delete/undo). Undo/redo payloads are omitted unless include_payload is true. limit: default 50, max ${ACTION_LOG_MAX_LIMIT}; with include_payload default ${ACTION_LOG_PAYLOAD_DEFAULT_LIMIT}, max ${ACTION_LOG_PAYLOAD_MAX_LIMIT} (larger values are clamped).`,
    {
      type: z.string().optional(),
      since: iso.optional(),
      until: iso.optional(),
      include_cancelled: z.boolean().optional(),
      include_payload: z.boolean().optional(),
      limit: z.number().int().min(1).max(ACTION_LOG_MAX_LIMIT).optional(),
      offset: z.number().int().min(0).optional(),
    },
    (a, db) =>
      listActionLog(db, {
        type: a.type,
        since: a.since,
        until: a.until,
        includeCancelled: a.include_cancelled,
        includePayload: a.include_payload,
        limit: a.limit,
        offset: a.offset,
      })
  )

  tool('describe_data', 'Describe data',
    'List readable tables, their columns and encoding notes. Call before query_data.', {},
    async () => describeData())

  tool(
    'query_data',
    'Query data',
    'Generic read-only query over allowlisted tables (see describe_data). Filters: eq, neq, gt, gte, lt, lte, ilike, in. Paginated, max 500 rows.',
    {
      table: z.string(),
      columns: z.array(z.string()).optional(),
      filters: z
        .array(
          z.object({
            column: z.string(),
            op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'ilike', 'in']),
            value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
          })
        )
        .optional(),
      order_by: z.string().optional(),
      ascending: z.boolean().optional(),
      ...page,
    },
    (a, db) => queryData(db, a)
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
