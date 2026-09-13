import { getBaseUrl } from '@/lib/oauth/baseUrl'

// Imported into a ChatGPT Custom GPT's Actions (or an Apps SDK app) to
// describe the same read-only endpoints the MCP server exposes to Claude.
export async function GET(req: Request) {
  const base = getBaseUrl(req)

  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Finance Tracker (read-only)',
      description:
        "Read-only access to the user's wallets, transactions and financial summary. No write operations are exposed.",
      version: '1.0.0',
    },
    servers: [{ url: base }],
    paths: {
      '/api/v1/wallets': {
        get: {
          operationId: 'listWallets',
          summary: 'List the wallets and their current balances',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      wallets: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            slug: { type: 'string' },
                            name: { type: 'string' },
                            description: { type: 'string', nullable: true },
                            balance: { type: 'number' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/transactions': {
        get: {
          operationId: 'listTransactions',
          summary: 'List transactions, optionally filtered by wallet, type or date',
          parameters: [
            { name: 'wallet', in: 'query', schema: { type: 'string' }, description: 'Wallet slug' },
            { name: 'type', in: 'query', schema: { type: 'string', enum: ['income', 'expense'] } },
            { name: 'since', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      transactions: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            date: { type: 'string', format: 'date-time' },
                            title: { type: 'string' },
                            amount: { type: 'number' },
                            type: { type: 'string', enum: ['income', 'expense'] },
                            walletSlug: { type: 'string' },
                            walletName: { type: 'string' },
                            isDebt: { type: 'boolean' },
                            netEffect: { type: 'number' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/summary': {
        get: {
          operationId: 'getFinancialSummary',
          summary: 'Get net worth, wallet balances, and active debts/credits',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      netWorth: { type: 'number' },
                      wallets: { type: 'array', items: { type: 'object' } },
                      activeCredits: { type: 'object' },
                      activeDebts: { type: 'object' },
                      transactionCount: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        OAuth2: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: `${base}/oauth/authorize`,
              tokenUrl: `${base}/api/oauth/token`,
              scopes: { read: 'Read-only access to your financial data' },
            },
          },
        },
      },
    },
    security: [{ OAuth2: ['read'] }],
  }

  return Response.json(spec)
}
