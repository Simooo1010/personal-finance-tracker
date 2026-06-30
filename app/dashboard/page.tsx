'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Plus, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Transaction } from '@/lib/supabase'
import TransactionForm from '@/components/TransactionForm'
import { getTransactionEffect, parseTransaction } from '@/lib/transactions'
import { createClient } from '@/lib/supabaseClient'
import { useWallets } from '@/components/WalletContext'

export default function DashboardHome() {
  const { walletMap, defaultWallet } = useWallets()
  const supabase = createClient()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState<'income' | 'expense'>('income')
  const [loading, setLoading] = useState(true)

  const fetchTransactions = useCallback(async () => {
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setTransactions(data)
    setLoading(false)
  }, [])

  useEffect(() => {
     
    fetchTransactions()
    window.addEventListener('finance_db_changed', fetchTransactions)
    return () => window.removeEventListener('finance_db_changed', fetchTransactions)
  }, [fetchTransactions])

  const realTransactions = transactions.filter(t => !t.title.endsWith('-transfer]'))
  
  let totalIncome = 0
  let totalExpense = 0
  realTransactions.forEach(t => {
    const effect = getTransactionEffect(t, defaultWallet)
    totalIncome += effect.income
    totalExpense += effect.expense
  })
  
  const balance = totalIncome - totalExpense
  const recent = realTransactions.slice(0, 6)

  const fmt = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2 })

  return (
    <div className="space-y-12 py-4">

      {/* Hero Balance Section */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <div>
          <span className="text-[10px] tracking-[0.3em] uppercase text-muted font-normal block mb-2">
            Disponibilità Attuale
          </span>
          <h1 className={`text-6xl sm:text-7xl font-thin tracking-tight text-fg ${balance < 0 ? 'text-expense' : ''}`}>
            €{fmt(balance)}
          </h1>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-8 border-t border-border/10 pt-8">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted">
              <TrendingUp className="w-3.5 h-3.5 text-income" strokeWidth={1.5} />
              <span className="text-[9px] tracking-[0.25em] uppercase font-light">Entrate</span>
            </div>
            <p className="text-xl font-light text-income">€{fmt(totalIncome)}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted">
              <TrendingDown className="w-3.5 h-3.5 text-expense" strokeWidth={1.5} />
              <span className="text-[9px] tracking-[0.25em] uppercase font-light">Uscite</span>
            </div>
            <p className="text-xl font-light text-expense">€{fmt(totalExpense)}</p>
          </div>
        </div>
      </motion.div>

      {/* Quick Actions Buttons */}
      <div className="grid grid-cols-2 gap-4">
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => { setFormType('income'); setShowForm(true) }}
          className="flex items-center justify-center gap-2 py-4 rounded-xl bg-income/10 text-income hover:bg-income hover:text-white text-xs tracking-wider uppercase font-medium t cursor-pointer"
        >
          <Plus className="w-4 h-4" strokeWidth={1.5} />
          Entrata
        </motion.button>
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => { setFormType('expense'); setShowForm(true) }}
          className="flex items-center justify-center gap-2 py-4 rounded-xl bg-expense/10 text-expense hover:bg-expense hover:text-white text-xs tracking-wider uppercase font-medium t cursor-pointer"
        >
          <Plus className="w-4 h-4" strokeWidth={1.5} />
          Uscita
        </motion.button>
      </div>

      {/* Recent Ledger List */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="space-y-6"
      >
        <div className="flex items-center justify-between pb-3 border-b border-border/10">
          <span className="text-[10px] tracking-[0.3em] uppercase text-muted font-normal">
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
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.03 }}
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
                          <span className="px-1.5 py-0.5 rounded text-[8px] tracking-wide uppercase font-semibold bg-purple-500/10 text-purple-400">
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
                  <span className={`text-sm font-light ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
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
        onSaved={fetchTransactions}
        defaultType={formType}
      />
    </div>
  )
}
