'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, ArrowDownRight, History } from 'lucide-react'
import Money from '@/components/Money'
import ThemeToggle from '@/components/ThemeToggle'
import Liquid from '@/components/Liquid'
import { SparkleIcon } from '@/components/SparkleIcon'
import { useAi } from '@/components/AiContext'
import { clampLevel, computeLevelRatio } from '@/lib/level'
import { getTransactionEffect, getWalletBalances, parseTransaction } from '@/lib/transactions'
import { useWallets } from '@/components/WalletContext'
import { useTransactions } from '@/components/TransactionsContext'
import { useTransactionSheet } from '@/components/TransactionSheetContext'

const fmt = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2 })

export default function DashboardHome() {
  const router = useRouter()
  const { wallets, walletMap, defaultWallet } = useWallets()
  const { transactions, loading } = useTransactions()
  const { isAiEnabled } = useAi()
  const { open: openSheet } = useTransactionSheet()
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null)

  const data = useMemo(() => {
    const real = transactions.filter(t => !t.title.endsWith('-transfer]'))
    const now = new Date()
    const inMonth = (iso: string) => {
      const d = new Date(iso)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    }
    const balances = getWalletBalances(transactions, wallets.map(w => w.slug), defaultWallet)
    let total = 0
    real.forEach(t => {
      const e = getTransactionEffect(t, defaultWallet)
      total += e.income - e.expense
    })

    let toRedeem = 0
    let toPay = 0
    let hasDebts = false
    transactions.forEach(t => {
      const parsed = parseTransaction(t, defaultWallet)
      if (!parsed.isDebt || parsed.debtInfo === null || parsed.debtInfo.status !== 'active') return
      hasDebts = true
      if (parsed.debtInfo.type === 'to_me') toRedeem += Number(t.amount)
      else toPay += Number(t.amount)
    })

    return { real, inMonth, balances, total, toRedeem, toPay, hasDebts }
  }, [transactions, wallets, defaultWallet])

  const ratio = useMemo(() => computeLevelRatio(transactions, defaultWallet), [transactions, defaultWallet])
  const level = clampLevel(ratio)

  // The selected wallet filters the balance, the month pills and the list.
  const scoped = useMemo(
    () => (selectedWallet ? data.real.filter(t => parseTransaction(t, defaultWallet).wallet === selectedWallet) : data.real),
    [data.real, selectedWallet, defaultWallet],
  )
  const { monthIn, monthOut } = useMemo(() => {
    let i = 0
    let o = 0
    scoped.filter(t => data.inMonth(t.created_at)).forEach(t => {
      const e = getTransactionEffect(t, defaultWallet)
      i += e.income
      o += e.expense
    })
    return { monthIn: i, monthOut: o }
  }, [scoped, data, defaultWallet])

  const balance = selectedWallet ? (data.balances[selectedWallet] ?? 0) : data.total
  const recent = useMemo(() => scoped.slice(0, 8), [scoped])
  const largest = Math.max(1, ...wallets.map(w => Math.max(0, data.balances[w.slug] ?? 0)))
  const empty = !loading && data.real.length === 0

  return (
    <div className="relative z-10 space-y-8 py-4">
      <Liquid level={level} variant="full" />

      <header className="flex items-center justify-between">
        <span className="text-sm font-light uppercase tracking-[0.3em]">Finance</span>
        <div className="flex items-center gap-2">
          <ThemeToggle className="!p-0 w-11 h-11 flex items-center justify-center !bg-bg !border-outline" />
          <button
            onClick={() => router.push('/dashboard/log')}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-bg border border-outline text-fg cursor-pointer"
            aria-label="Registro attività"
            title="Registro attività"
          >
            <History className="w-5 h-5" strokeWidth={1.5} />
          </button>
          {isAiEnabled && (
            <button
              onClick={() => router.push('/dashboard/ai-chat')}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-bg border border-outline text-fg cursor-pointer"
              aria-label="Assistente"
              title="Assistente"
            >
              <SparkleIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      <section className="space-y-4">
        <span className="text-[11px] uppercase tracking-[0.25em] text-muted block">
          {selectedWallet ? `Saldo · ${walletMap[selectedWallet] ?? selectedWallet}` : 'Saldo totale'}
        </span>
        <h1 className={`tracking-tight text-[40px] sm:text-[58px] leading-none ${balance < 0 ? 'text-expense' : 'text-fg'}`}>
          <Money amount={balance} intWeight={700} centsWeight={200} euroScale={0.38} centsScale={0.52} />
        </h1>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full border border-outline text-income font-display text-xs font-medium whitespace-nowrap">
            <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            <span className="font-sans font-light text-muted">Entrate</span> +{fmt(monthIn)}
          </span>
          <span className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full border border-outline text-expense font-display text-xs font-medium whitespace-nowrap">
            <ArrowDownRight className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            <span className="font-sans font-light text-muted">Uscite</span> -{fmt(monthOut)}
          </span>
        </div>
      </section>

      <section className="space-y-6 pb-24">
        <p className="text-[11px] uppercase tracking-[0.25em] text-muted">
          Livello {ratio === null ? '—' : `${Math.round(ratio * 100)}%`} · del massimo a 90 giorni
        </p>

        {wallets.length > 0 && (
          <div className="grid grid-cols-2 gap-3" role="group" aria-label="Portafogli">
            {wallets.map((w, i) => {
              const bal = data.balances[w.slug] ?? 0
              const selected = selectedWallet === w.slug
              return (
                <button
                  key={w.slug}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedWallet(selected ? null : w.slug)}
                  className={`tank-bob card flex items-stretch gap-3 p-4 min-h-[88px] text-left cursor-pointer !border-[1.5px] ${selected ? '!border-fg' : '!border-outline'}`}
                  style={{ animationDelay: `${i * 0.6}s` }}
                >
                  <span className="w-2.5 rounded-full bg-elevated border border-outline relative overflow-hidden shrink-0" aria-hidden="true">
                    <span
                      className="gauge-fill absolute inset-x-0 bottom-0 bg-income"
                      style={{ height: `${Math.round((Math.max(0, bal) / largest) * 100)}%` }}
                    />
                  </span>
                  <span className="min-w-0 flex flex-col justify-between">
                    <span className="text-xs text-muted truncate">{w.name}</span>
                    <Money amount={bal} intWeight={600} centsWeight={200} euroScale={0.6} className="text-[15px] truncate" />
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {data.hasDebts && (
          <button
            type="button"
            onClick={() => router.push('/dashboard/debts')}
            className="card grid grid-cols-2 gap-4 p-5 w-full text-left cursor-pointer"
            aria-label="Apri debiti"
          >
            <span>
              <span className="text-[11px] uppercase tracking-[0.25em] text-muted block mb-1">Da ricevere</span>
              <Money amount={data.toRedeem} intWeight={600} centsWeight={200} className="text-base text-debt" />
            </span>
            <span>
              <span className="text-[11px] uppercase tracking-[0.25em] text-muted block mb-1">Da pagare</span>
              <Money amount={data.toPay} intWeight={600} centsWeight={200} className="text-base text-debt" />
            </span>
          </button>
        )}

        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-muted pb-3">Ultime operazioni</p>
          {loading ? (
            <div className="space-y-px" aria-busy="true" aria-label="Caricamento">
              {[0, 1, 2, 3].map(i => <div key={i} className="h-[52px] rounded-2xl bg-surface mb-2" />)}
            </div>
          ) : empty ? (
            <div className="py-10 text-center space-y-4">
              <p className="text-sm text-muted">Nessuna operazione registrata</p>
              <button
                type="button"
                onClick={() => openSheet('income')}
                className="min-h-11 px-6 rounded-full bg-fg text-bg font-bold text-sm cursor-pointer"
              >
                Aggiungi la prima
              </button>
            </div>
          ) : recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Nessuna operazione per questo portafoglio</p>
          ) : (
            <ul className="divide-y divide-outline/60">
              {recent.map(t => {
                const parsed = parseTransaction(t, defaultWallet)
                const walletLabel = walletMap[parsed.wallet] || parsed.wallet
                const income = t.type === 'income'
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 min-h-[52px] py-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${income ? 'text-income' : 'text-expense'}`}>
                        {income ? <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} /> : <ArrowDownRight className="w-4 h-4" strokeWidth={1.5} />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[15px] font-light truncate">{parsed.cleanTitle}</p>
                        <p className="text-xs text-muted truncate">
                          {walletLabel} · {new Date(t.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    </div>
                    <span className={`font-display text-xs font-medium whitespace-nowrap tabular-nums ${income ? 'text-income' : 'text-expense'}`}>
                      {income ? '+' : '-'}€{fmt(Number(t.amount))}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
