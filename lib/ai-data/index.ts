import type { ReadOnlyDb } from './readonly'
import { parseTransaction, getTransactionEffect, getWalletBalances } from '@/lib/transactions'
import type { Transaction } from '@/lib/supabase'
import type { Wallet } from '@/lib/wallets'
import { parseSince } from './dates'

/**
 * Read-only, per-user financial data for AI clients (MCP tools + REST v1).
 * `supabase` must already be scoped to the requesting user (see
 * lib/oauth/verifyToken.ts) — every query below relies on RLS to keep users
 * from ever seeing each other's rows; nothing here filters by user_id itself.
 */

// PostgREST caps every response (max-rows, 1000 on Supabase), so a plain
// select silently drops rows past the cap. Loaders page with .range() over a
// deterministic order until a short page.
const PAGE_SIZE = 1000
const MAX_PAGES = 200

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function fetchAllPages<T>(fetchPage: (from: number, to: number) => PageResult<T>, errorPrefix: string): Promise<T[]> {
  const all: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${errorPrefix}: ${error.message}`)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE_SIZE) return all
  }
  // Never return a silently partial dataset: totals/balances would be wrong.
  throw new Error(`${errorPrefix}: troppe righe (oltre ${MAX_PAGES * PAGE_SIZE})`)
}

export async function getWallets(supabase: ReadOnlyDb): Promise<Wallet[]> {
  return fetchAllPages<Wallet>(
    (from, to) => supabase.from('wallets').select('*').order('position').order('id').range(from, to),
    'Errore nel caricamento dei portafogli'
  )
}

export async function getRawTransactions(supabase: ReadOnlyDb): Promise<Transaction[]> {
  return fetchAllPages<Transaction>(
    (from, to) =>
      supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    'Errore nel caricamento delle transazioni'
  )
}

export async function getWalletBalancesById(supabase: ReadOnlyDb) {
  const [wallets, transactions] = await Promise.all([getWallets(supabase), getRawTransactions(supabase)])
  return walletBalancesFrom(wallets, transactions)
}

function walletBalancesFrom(wallets: Wallet[], transactions: Transaction[]) {
  const defaultWallet = wallets.find(w => w.position === 0)?.slug || 'generale'
  const walletSlugs = wallets.map(w => w.slug)
  const balances = getWalletBalances(transactions, walletSlugs, defaultWallet)
  return wallets.map(w => ({
    id: w.id,
    slug: w.slug,
    name: w.name,
    description: w.description,
    balance: Number((balances[w.slug] || 0).toFixed(2)),
  }))
}

export interface TransactionFilters {
  walletSlug?: string
  type?: 'income' | 'expense'
  since?: string // ISO date
  limit?: number
}

export async function listTransactions(supabase: ReadOnlyDb, filters: TransactionFilters = {}) {
  const [wallets, transactions] = await Promise.all([getWallets(supabase), getRawTransactions(supabase)])
  const defaultWallet = wallets.find(w => w.position === 0)?.slug || 'generale'
  const walletMap = new Map(wallets.map(w => [w.slug, w.name]))

  let items = transactions
    .filter(t => !t.title.endsWith('-transfer]')) // internal wallet-to-wallet transfers
    .map(t => {
      const parsed = parseTransaction(t, defaultWallet)
      const effect = getTransactionEffect(t, defaultWallet)
      return {
        id: t.id,
        date: t.created_at,
        title: parsed.cleanTitle,
        amount: Number(t.amount),
        type: t.type,
        walletSlug: parsed.wallet,
        walletName: walletMap.get(parsed.wallet) || parsed.wallet,
        isDebt: parsed.isDebt,
        debt: parsed.debtInfo,
        netEffect: Number((effect.income - effect.expense).toFixed(2)),
      }
    })

  if (filters.walletSlug) items = items.filter(t => t.walletSlug === filters.walletSlug)
  if (filters.type) items = items.filter(t => t.type === filters.type)
  if (filters.since) {
    const since = parseSince(filters.since)! // date-only = start of that day in Europe/Rome
    items = items.filter(t => new Date(t.date).getTime() >= since)
  }
  if (filters.limit) items = items.slice(0, filters.limit)

  return items
}

export async function getFinancialSummary(supabase: ReadOnlyDb) {
  // Load each table once (both loaders page through the full history).
  const [wallets, transactions] = await Promise.all([getWallets(supabase), getRawTransactions(supabase)])
  const walletBalances = walletBalancesFrom(wallets, transactions)

  const netWorth = Number(walletBalances.reduce((sum, w) => sum + w.balance, 0).toFixed(2))

  const defaultWallet = wallets.find(w => w.position === 0)?.slug || 'generale'
  const debts = transactions
    .map(t => ({ amount: Number(t.amount), ...parseTransaction(t, defaultWallet) }))
    .filter(item => item.isDebt && item.debtInfo && item.debtInfo.status === 'active')

  const activeCredits = debts.filter(d => d.debtInfo?.type === 'to_me')
  const activeDebts = debts.filter(d => d.debtInfo?.type === 'by_me')

  return {
    netWorth,
    wallets: walletBalances,
    activeCredits: {
      total: Number(activeCredits.reduce((s, c) => s + c.amount, 0).toFixed(2)),
      items: activeCredits.map(d => ({ person: d.debtInfo!.person, description: d.debtInfo!.desc, amount: d.amount })),
    },
    activeDebts: {
      total: Number(activeDebts.reduce((s, d) => s + d.amount, 0).toFixed(2)),
      items: activeDebts.map(d => ({ person: d.debtInfo!.person, description: d.debtInfo!.desc, amount: d.amount })),
    },
    transactionCount: transactions.length,
  }
}
