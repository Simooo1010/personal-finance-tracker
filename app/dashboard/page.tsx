'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Plus, ArrowUpRight, ArrowDownRight, History } from 'lucide-react'
import { Transaction } from '@/lib/supabase'
import TransactionForm from '@/components/TransactionForm'
import Money from '@/components/Money'
import ThemeToggle from '@/components/ThemeToggle'
import { getTransactionEffect, parseTransaction } from '@/lib/transactions'
import { useWallets } from '@/components/WalletContext'
import { useTransactions } from '@/components/TransactionsContext'

export default function DashboardHome() {
  const router = useRouter()
  const { walletMap, defaultWallet } = useWallets()
  const { transactions, loading, upsertTransaction } = useTransactions()
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState<'income' | 'expense'>('income')

  // Derived once per data change, not on every render (keeps section switches instant).
  const { realTransactions, totalIncome, totalExpense, totalToRedeem, totalToPay } = useMemo(() => {
    const real = transactions.filter(t => !t.title.endsWith('-transfer]'))
    let income = 0
    let expense = 0
    real.forEach(t => {
      const effect = getTransactionEffect(t, defaultWallet)
      income += effect.income
      expense += effect.expense
    })

    let toRedeem = 0
    let toPay = 0
    transactions.forEach(t => {
      const parsed = parseTransaction(t, defaultWallet)
      if (!parsed.isDebt || parsed.debtInfo === null || parsed.debtInfo.status !== 'active') return
      const amount = Number(t.amount)
      if (parsed.debtInfo.type === 'to_me') toRedeem += amount
      else if (parsed.debtInfo.type === 'by_me') toPay += amount
    })

    return { realTransactions: real, totalIncome: income, totalExpense: expense, totalToRedeem: toRedeem, totalToPay: toPay }
  }, [transactions, defaultWallet])

  const balance = totalIncome - totalExpense
  const recent = useMemo(() => realTransactions.slice(0, 6), [realTransactions])

  const fmt = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2 })

  return (
    <div className="space-y-12 py-4">

      {/* Hero Balance Section */}
      <motion.div
        initial={{ y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.06 }}
        className="space-y-6"
      >
        <div className="flex justify-between items-start">
          <div>
            <span className="text-[10px] tracking-[0.3em] uppercase text-muted font-semibold block mb-2">
              Disponibilità Attuale
            </span>
            <h1 className={`text-4xl sm:text-6xl tracking-tight text-fg ${balance < 0 ? 'text-expense' : ''}`}>
              <Money amount={balance} intWeight={700} centsWeight={200} />
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button 
              onClick={() => router.push('/dashboard/log')}
              className="p-3 rounded-full bg-surface border border-border/10 text-fg hover:bg-elevated transition-colors"
              title="Registro Attività"
            >
              <History className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-8 border-t border-border/10 pt-8">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted">
              <TrendingUp className="w-3.5 h-3.5 text-income" strokeWidth={1.5} />
              <span className="text-[9px] tracking-[0.25em] uppercase font-light">Entrate</span>
            </div>
            <p className="text-lg text-income"><Money amount={totalIncome} intWeight={600} centsWeight={200} /></p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted">
              <TrendingDown className="w-3.5 h-3.5 text-expense" strokeWidth={1.5} />
              <span className="text-[9px] tracking-[0.25em] uppercase font-light">Uscite</span>
            </div>
            <p className="text-lg text-expense"><Money amount={totalExpense} intWeight={600} centsWeight={200} /></p>
          </div>
        </div>
      </motion.div>

      {/* Quick Actions Buttons */}
      <div className="grid grid-cols-2 gap-4">
        <motion.button
          initial={{ y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.06, ease: 'easeOut', delay: 0.01 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => { setFormType('income'); setShowForm(true) }}
          className="flex items-center justify-center gap-2 py-4 rounded-full bg-income/10 text-income hover:bg-income hover:text-bg text-xs tracking-wider uppercase font-bold t cursor-pointer"
        >
          <Plus className="w-4 h-4" strokeWidth={1.5} />
          Entrata
        </motion.button>
        <motion.button
          initial={{ y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.06, ease: 'easeOut', delay: 0.01 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => { setFormType('expense'); setShowForm(true) }}
          className="flex items-center justify-center gap-2 py-4 rounded-full bg-expense/10 text-expense hover:bg-expense hover:text-bg text-xs tracking-wider uppercase font-bold t cursor-pointer"
        >
          <Plus className="w-4 h-4" strokeWidth={1.5} />
          Uscita
        </motion.button>
      </div>

      {/* Debts Summary Card */}
      <motion.div
        initial={{ y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.06, ease: 'easeOut', delay: 0.01 }}
        onClick={() => router.push('/dashboard/debts')}
        className="card p-5 cursor-pointer hover:border-border/20 t flex flex-col justify-between"
      >
        <span className="text-[10px] tracking-[0.3em] uppercase text-muted font-semibold block mb-4">
          Situazione Debiti
        </span>
        <div className="grid grid-cols-2 gap-4 divide-x divide-border/5">
          <div>
            <span className="text-[9px] tracking-[0.25em] uppercase text-muted block mb-1">Da ricevere</span>
            <p className="text-lg text-income"><Money amount={totalToRedeem} intWeight={600} centsWeight={200} /></p>
          </div>
          <div className="pl-4">
            <span className="text-[9px] tracking-[0.25em] uppercase text-muted block mb-1">Da pagare</span>
            <p className="text-lg text-expense"><Money amount={totalToPay} intWeight={600} centsWeight={200} /></p>
          </div>
        </div>
      </motion.div>

      {/* Recent Ledger List */}
      <motion.div
        initial={{ y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.06, ease: 'easeOut', delay: 0.01 }}
        className="space-y-6"
      >
        <div className="flex items-center justify-between pb-3 border-b border-border/10">
          <span className="text-[10px] tracking-[0.3em] uppercase text-muted font-semibold">
            Ledger Recente
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border border-muted/20 border-t-muted/80 rounded-full animate-spin" />
          </div>
        ) : recent.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted font-light">Nessuna operazione registrata</p>
          </div>
        ) : (
          <div className="divide-y divide-border/5">
            {recent.map((t, i) => {
              const parsed = parseTransaction(t, defaultWallet)
              const walletLabel = walletMap[parsed.wallet] || parsed.wallet
              
              return (
                <motion.div
                  key={t.id}
                  initial={{ y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.06, ease: 'easeOut', delay: Math.min(i, 5) * 0.006 }}
                  className="flex items-center justify-between py-4 group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      t.type === 'income' ? 'bg-income/5 text-income' : 'bg-expense/5 text-expense'
                    }`}>
                      {t.type === 'income' ? (
                        <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
                      ) : (
                        <ArrowDownRight className="w-4 h-4" strokeWidth={1.5} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-light text-fg truncate">{parsed.cleanTitle}</p>
                        {parsed.isDebt && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] tracking-wide uppercase font-semibold bg-debt/10 text-debt">
                            {parsed.debtInfo?.type === 'to_me' ? 'Credito' : 'Debito'}
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded text-[8px] tracking-wide uppercase font-light bg-elevated text-muted">
                          {walletLabel}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted tracking-wider mt-0.5">
                        {new Date(t.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} • {new Date(t.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <span className={`font-display text-xs font-medium whitespace-nowrap ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                    {t.type === 'income' ? '+' : '-'}€{fmt(Number(t.amount))}
                  </span>
                </motion.div>
              )
            })}
          </div>
        )}
      </motion.div>

      <TransactionForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSaved={(saved) => saved && upsertTransaction(saved)}
        defaultType={formType}
      />
    </div>
  )
}
