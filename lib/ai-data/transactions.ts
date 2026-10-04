import type { ReadOnlyDb } from './readonly'
import { getWallets, getRawTransactions } from './index'
import { parseTransaction, getTransactionEffect, getWalletBalances, type DebtInfo } from '@/lib/transactions'
import type { Transaction } from '@/lib/supabase'
import type { Wallet } from '@/lib/wallets'
import { parseSince, parseUntil, inRange, romeMonthKey, romeYearMonth } from './dates'

/**
 * Extended read-only query helpers for AI clients. Everything here goes through
 * ReadOnlyDb (select only) and the shared loaders in './index'.
 *
 * Domain rules:
 * - Transfers (title ending in '-transfer]') are internal wallet moves and are
 *   excluded from income/expense stats.
 * - Net effects always come from getTransactionEffect (completed debts = 0,
 *   active debts are inverted: to_me = expense, by_me = income).
 */

// ---------- helpers ----------

const round2 = (n: number) => Number(n.toFixed(2))

// since/until: date-only values are whole days in Europe/Rome (see ./dates).

function isTransfer(t: Transaction): boolean {
  return t.title.endsWith('-transfer]')
}

function defaultWalletOf(wallets: Wallet[]): string {
  return wallets.find(w => w.position === 0)?.slug || 'generale'
}

export interface TransactionItem {
  id: string
  date: string
  title: string
  amount: number
  type: 'income' | 'expense'
  walletSlug: string
  walletName: string
  isDebt: boolean
  debt: DebtInfo | null
  netEffect: number
  isTransfer: boolean
}

function toItem(t: Transaction, defaultWallet: string, walletNames: Map<string, string>): TransactionItem {
  const parsed = parseTransaction(t, defaultWallet)
  const effect = getTransactionEffect(t, defaultWallet)
  return {
    id: t.id,
    date: t.created_at,
    title: parsed.cleanTitle,
    amount: Number(t.amount),
    type: t.type,
    walletSlug: parsed.wallet,
    walletName: walletNames.get(parsed.wallet) || parsed.wallet,
    isDebt: parsed.isDebt,
    debt: parsed.debtInfo,
    netEffect: round2(effect.income - effect.expense),
    isTransfer: isTransfer(t),
  }
}

async function loadAll(db: ReadOnlyDb) {
  const [wallets, transactions] = await Promise.all([getWallets(db), getRawTransactions(db)])
  const defaultWallet = defaultWalletOf(wallets)
  const walletNames = new Map(wallets.map(w => [w.slug, w.name]))
  return { wallets, transactions, defaultWallet, walletNames }
}

// ---------- 1. searchTransactions ----------

export interface SearchTransactionsFilters {
  query?: string
  walletSlug?: string
  type?: 'income' | 'expense'
  since?: string
  until?: string
  minAmount?: number
  maxAmount?: number
  includeTransfers?: boolean
  includeDebts?: boolean
  sort?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
  limit?: number
  offset?: number
}

export async function searchTransactions(
  db: ReadOnlyDb,
  f: SearchTransactionsFilters = {}
): Promise<{ total: number; offset: number; limit: number; items: TransactionItem[] }> {
  const since = parseSince(f.since)
  const until = parseUntil(f.until)
  const limit = Math.min(Math.max(Math.floor(f.limit ?? 100), 1), 500)
  const offset = Math.max(Math.floor(f.offset ?? 0), 0)
  const includeTransfers = f.includeTransfers ?? false
  const includeDebts = f.includeDebts ?? true
  const q = f.query?.trim().toLowerCase()

  const { transactions, defaultWallet, walletNames } = await loadAll(db)

  let items = transactions
    .filter(t => includeTransfers || !isTransfer(t))
    .map(t => toItem(t, defaultWallet, walletNames))
    .filter(it => {
      if (!includeDebts && it.isDebt) return false
      if (f.walletSlug && it.walletSlug !== f.walletSlug) return false
      if (f.type && it.type !== f.type) return false
      if (!inRange(new Date(it.date).getTime(), since, until)) return false
      if (f.minAmount !== undefined && it.amount < f.minAmount) return false
      if (f.maxAmount !== undefined && it.amount > f.maxAmount) return false
      if (q) {
        const haystack = [it.title, it.debt?.person ?? '', it.debt?.desc ?? ''].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })

  const sort = f.sort ?? 'date_desc'
  const dateOf = (it: TransactionItem) => new Date(it.date).getTime()
  items = items.sort((a, b) => {
    switch (sort) {
      case 'date_asc':
        return dateOf(a) - dateOf(b)
      case 'amount_desc':
        return b.amount - a.amount || dateOf(b) - dateOf(a)
      case 'amount_asc':
        return a.amount - b.amount || dateOf(b) - dateOf(a)
      case 'date_desc':
      default:
        return dateOf(b) - dateOf(a)
    }
  })

  return { total: items.length, offset, limit, items: items.slice(offset, offset + limit) }
}

// ---------- 2. getTransactionById ----------

export async function getTransactionById(db: ReadOnlyDb, id: string): Promise<TransactionItem | null> {
  const { transactions, defaultWallet, walletNames } = await loadAll(db)
  const t = transactions.find(x => x.id === id)
  return t ? toItem(t, defaultWallet, walletNames) : null
}

// ---------- 3. getPeriodStats ----------

export interface PeriodStatsFilters {
  since?: string
  until?: string
  walletSlug?: string
  /** Default true: active debts count (by_me = income, to_me = expense). false skips debt rows entirely. */
  includeDebts?: boolean
}

export async function getPeriodStats(db: ReadOnlyDb, f: PeriodStatsFilters = {}) {
  const since = parseSince(f.since)
  const until = parseUntil(f.until)
  const includeDebts = f.includeDebts ?? true
  const { wallets, transactions, defaultWallet, walletNames } = await loadAll(db)

  const perWallet = new Map<string, { slug: string; name: string; income: number; expense: number }>()
  for (const w of wallets) {
    if (!f.walletSlug || w.slug === f.walletSlug) {
      perWallet.set(w.slug, { slug: w.slug, name: w.name, income: 0, expense: 0 })
    }
  }

  let income = 0
  let expense = 0
  let transactionCount = 0

  for (const t of transactions) {
    if (isTransfer(t)) continue
    if (!inRange(new Date(t.created_at).getTime(), since, until)) continue
    const parsed = parseTransaction(t, defaultWallet)
    if (!includeDebts && parsed.isDebt) continue
    if (f.walletSlug && parsed.wallet !== f.walletSlug) continue
    const effect = getTransactionEffect(t, defaultWallet)
    income += effect.income
    expense += effect.expense
    transactionCount++
    let w = perWallet.get(parsed.wallet)
    if (!w) {
      w = { slug: parsed.wallet, name: walletNames.get(parsed.wallet) || parsed.wallet, income: 0, expense: 0 }
      perWallet.set(parsed.wallet, w)
    }
    w.income += effect.income
    w.expense += effect.expense
  }

  const net = income - expense
  return {
    since: f.since ?? null,
    until: f.until ?? null,
    includeDebts,
    income: round2(income),
    expense: round2(expense),
    net: round2(net),
    savingsRate: income === 0 ? null : round2((net / income) * 100),
    transactionCount,
    perWallet: Array.from(perWallet.values()).map(w => ({
      slug: w.slug,
      name: w.name,
      income: round2(w.income),
      expense: round2(w.expense),
      net: round2(w.income - w.expense),
    })),
  }
}

// ---------- 4. getSpendingBreakdown ----------

export interface SpendingBreakdownFilters {
  since?: string
  until?: string
  groupBy: 'wallet' | 'title'
  limit?: number
}

export async function getSpendingBreakdown(db: ReadOnlyDb, f: SpendingBreakdownFilters) {
  const since = parseSince(f.since)
  const until = parseUntil(f.until)
  const limit = Math.max(Math.floor(f.limit ?? 20), 1)
  const { transactions, defaultWallet, walletNames } = await loadAll(db)

  const groups = new Map<string, { key: string; label: string; total: number; count: number }>()
  let grandTotal = 0

  for (const t of transactions) {
    if (isTransfer(t)) continue
    if (!inRange(new Date(t.created_at).getTime(), since, until)) continue
    const effect = getTransactionEffect(t, defaultWallet)
    if (effect.expense <= 0) continue
    const parsed = parseTransaction(t, defaultWallet)

    let key: string
    let label: string
    if (f.groupBy === 'wallet') {
      key = parsed.wallet
      label = walletNames.get(parsed.wallet) || parsed.wallet
    } else {
      key = parsed.cleanTitle.trim().toLowerCase()
      label = parsed.cleanTitle.trim()
    }

    let g = groups.get(key)
    if (!g) {
      g = { key, label, total: 0, count: 0 }
      groups.set(key, g)
    }
    g.total += effect.expense
    g.count++
    grandTotal += effect.expense
  }

  const items = Array.from(groups.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map(g => ({
      key: g.label,
      total: round2(g.total),
      count: g.count,
      share: grandTotal === 0 ? 0 : round2((g.total / grandTotal) * 100),
    }))

  return {
    groupBy: f.groupBy,
    since: f.since ?? null,
    until: f.until ?? null,
    totalExpense: round2(grandTotal),
    groupCount: groups.size,
    items,
  }
}

// ---------- 5. getMonthlyCashflow ----------

export interface MonthlyCashflowFilters {
  months?: number
  walletSlug?: string
  /** Default true: active debts count (by_me = income, to_me = expense). false skips debt rows entirely. */
  includeDebts?: boolean
}

export async function getMonthlyCashflow(db: ReadOnlyDb, f: MonthlyCashflowFilters = {}) {
  const months = Math.min(Math.max(Math.floor(f.months ?? 12), 1), 60)
  const includeDebts = f.includeDebts ?? true
  const { transactions, defaultWallet } = await loadAll(db)

  // Months are calendar months in Europe/Rome, ending with the current Rome month.
  const current = romeYearMonth()
  const buckets = new Map<string, { month: string; income: number; expense: number; transactionCount: number }>()
  const order: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(current.year, current.month - 1 - i, 1))
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    order.push(k)
    buckets.set(k, { month: k, income: 0, expense: 0, transactionCount: 0 })
  }

  for (const t of transactions) {
    if (isTransfer(t)) continue
    const ms = new Date(t.created_at).getTime()
    if (Number.isNaN(ms)) continue
    const b = buckets.get(romeMonthKey(ms))
    if (!b) continue
    const parsed = parseTransaction(t, defaultWallet)
    if (!includeDebts && parsed.isDebt) continue
    if (f.walletSlug && parsed.wallet !== f.walletSlug) continue
    const effect = getTransactionEffect(t, defaultWallet)
    b.income += effect.income
    b.expense += effect.expense
    b.transactionCount++
  }

  return order.map(k => {
    const b = buckets.get(k)!
    return {
      month: b.month,
      income: round2(b.income),
      expense: round2(b.expense),
      net: round2(b.income - b.expense),
      transactionCount: b.transactionCount,
    }
  })
}

// ---------- 6. listDebts ----------

export interface DebtFilters {
  status?: 'active' | 'completed'
  direction?: 'to_me' | 'by_me'
  person?: string
}

export async function listDebts(db: ReadOnlyDb, f: DebtFilters = {}) {
  const { transactions, defaultWallet } = await loadAll(db)
  const person = f.person?.trim().toLowerCase()

  const items = transactions
    .map(t => ({ t, parsed: parseTransaction(t, defaultWallet) }))
    .filter(({ parsed }) => parsed.isDebt && parsed.debtInfo)
    .map(({ t, parsed }) => ({
      id: t.id,
      date: t.created_at,
      person: parsed.debtInfo!.person,
      description: parsed.debtInfo!.desc,
      amount: Number(t.amount),
      direction: parsed.debtInfo!.type,
      status: parsed.debtInfo!.status,
      walletSlug: parsed.wallet,
    }))
    .filter(d => {
      if (f.status && d.status !== f.status) return false
      if (f.direction && d.direction !== f.direction) return false
      if (person && !String(d.person ?? '').toLowerCase().includes(person)) return false
      return true
    })

  const toMe = items.filter(d => d.direction === 'to_me').reduce((s, d) => s + d.amount, 0)
  const byMe = items.filter(d => d.direction === 'by_me').reduce((s, d) => s + d.amount, 0)

  return { items, totals: { toMe: round2(toMe), byMe: round2(byMe) } }
}

// ---------- 7. listTransfers ----------

export interface TransferFilters {
  since?: string
  until?: string
  limit?: number
}

export async function listTransfers(db: ReadOnlyDb, f: TransferFilters = {}) {
  const since = parseSince(f.since)
  const until = parseUntil(f.until)
  const limit = Math.min(Math.max(Math.floor(f.limit ?? 100), 1), 500)
  const { transactions, defaultWallet } = await loadAll(db)

  return transactions
    .filter(t => isTransfer(t) && inRange(new Date(t.created_at).getTime(), since, until))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
    .map(t => ({
      id: t.id,
      date: t.created_at,
      title: t.title,
      amount: Number(t.amount),
      type: t.type,
      walletSlug: parseTransaction(t, defaultWallet).wallet,
    }))
}

// ---------- 8. getWalletDetail ----------

export async function getWalletDetail(db: ReadOnlyDb, slug: string) {
  const { wallets, transactions, defaultWallet } = await loadAll(db)
  const wallet = wallets.find(w => w.slug === slug)
  if (!wallet) return null

  const balances = getWalletBalances(transactions, wallets.map(w => w.slug), defaultWallet)
  const own = transactions.filter(t => parseTransaction(t, defaultWallet).wallet === slug)
  const times = own.map(t => new Date(t.created_at).getTime()).filter(ms => !Number.isNaN(ms))

  return {
    id: wallet.id,
    slug: wallet.slug,
    name: wallet.name,
    description: wallet.description,
    position: wallet.position,
    balance: round2(balances[slug] || 0),
    transactionCount: own.length,
    firstTransactionDate: times.length ? new Date(Math.min(...times)).toISOString() : null,
    lastTransactionDate: times.length ? new Date(Math.max(...times)).toISOString() : null,
  }
}
