import type { SupabaseClient } from '@supabase/supabase-js'
import { parseTransaction, getTransactionEffect, getWalletBalances } from '@/lib/transactions'
import type { Transaction } from '@/lib/supabase'
import type { Wallet } from '@/lib/wallets'

/**
 * Read-only, per-user financial data for AI clients (MCP tools + REST v1).
 * `supabase` must already be scoped to the requesting user (see
 * lib/oauth/verifyToken.ts) — every query below relies on RLS to keep users
 * from ever seeing each other's rows; nothing here filters by user_id itself.
 */

export async function getWallets(supabase: SupabaseClient): Promise<Wallet[]> {
  const { data, error } = await supabase.from('wallets').select('*').order('position')
  if (error) throw new Error(`Errore nel caricamento dei portafogli: ${error.message}`)
  return data || []
}

async function getRawTransactions(supabase: SupabaseClient): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Errore nel caricamento delle transazioni: ${error.message}`)
  return data || []
}

export async function getWalletBalancesById(supabase: SupabaseClient) {
  const [wallets, transactions] = await Promise.all([getWallets(supabase), getRawTransactions(supabase)])
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

export async function listTransactions(supabase: SupabaseClient, filters: TransactionFilters = {}) {
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
    const since = new Date(filters.since).getTime()
    items = items.filter(t => new Date(t.date).getTime() >= since)
  }
  if (filters.limit) items = items.slice(0, filters.limit)

  return items
}

export async function getFinancialSummary(supabase: SupabaseClient) {
  const [walletBalances, transactions] = await Promise.all([
    getWalletBalancesById(supabase),
    getRawTransactions(supabase),
  ])

  const netWorth = Number(walletBalances.reduce((sum, w) => sum + w.balance, 0).toFixed(2))

  const wallets = await getWallets(supabase)
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
