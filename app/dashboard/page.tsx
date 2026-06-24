'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Plus } from 'lucide-react'
import { supabase, Transaction } from '@/lib/supabase'
import TransactionForm from '@/components/TransactionForm'

export default function DashboardHome() {
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
  }, [fetchTransactions])

  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const balance = totalIncome - totalExpense
  const recentTransactions = transactions.slice(0, 5)

  const openForm = (type: 'income' | 'expense') => {
    setFormType(type)
    setShowForm(true)
  }

  return (
    <div className="pt-6 lg:pt-0 lg:grid lg:grid-cols-3 lg:gap-8 lg:items-start h-full">
      
      {/* Left Column (Balance & Actions) */}
      <div className="space-y-6 lg:col-span-2">
        {/* Balance Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-6 lg:p-10"
        >
          <p className="text-xs text-muted font-extralight tracking-[0.2em] uppercase mb-2">
            Saldo Totale
          </p>
          <p className={`text-4xl lg:text-6xl font-extralight tracking-wide ${
            balance >= 0 ? 'text-income' : 'text-expense'
          }`}>
            €{balance.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>

          {/* Income/Expense Summary */}
          <div className="flex gap-4 mt-6 lg:mt-10">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-income" strokeWidth={1.5} />
                <span className="text-[10px] text-muted font-extralight tracking-widest uppercase">Entrate</span>
              </div>
              <p className="text-lg lg:text-2xl font-extralight text-income">
                €{totalIncome.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="w-px bg-border" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-3.5 h-3.5 text-expense" strokeWidth={1.5} />
                <span className="text-[10px] text-muted font-extralight tracking-widest uppercase">Uscite</span>
              </div>
              <p className="text-lg lg:text-2xl font-extralight text-expense">
                €{totalExpense.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <div className="flex gap-3">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => openForm('income')}
            className="flex-1 flex items-center justify-center gap-2 py-4 bg-income/10 border border-income/20 rounded-2xl text-income text-sm font-light tracking-wider transition-smooth hover:bg-income/20"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            Entrata
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => openForm('expense')}
            className="flex-1 flex items-center justify-center gap-2 py-4 bg-expense/10 border border-expense/20 rounded-2xl text-expense text-sm font-light tracking-wider transition-smooth hover:bg-expense/20"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            Uscita
          </motion.button>
        </div>
      </div>

      {/* Right Column (Recent Transactions) */}
      <div className="mt-8 lg:mt-0 lg:col-span-1 lg:bg-foreground/[0.01] lg:border lg:border-border lg:rounded-3xl lg:p-6 lg:h-full">
        <h2 className="text-xs text-muted font-extralight tracking-[0.2em] uppercase mb-4">
          Transazioni Recenti
        </h2>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
          </div>
        ) : recentTransactions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted font-extralight text-sm">Nessuna transazione</p>
            <p className="text-muted/50 font-extralight text-xs mt-1">Aggiungi la tua prima transazione</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTransactions.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between py-3 px-4 bg-foreground/[0.02] lg:bg-background rounded-2xl border border-transparent lg:border-border"
              >
                <div>
                  <p className="text-sm font-light">{t.title}</p>
                  <p className="text-[10px] text-muted font-extralight">
                    {new Date(t.created_at).toLocaleDateString('it-IT', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                </div>
                <p className={`text-sm font-light ${
                  t.type === 'income' ? 'text-income' : 'text-expense'
                }`}>
                  {t.type === 'income' ? '+' : '-'}€{Number(t.amount).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <TransactionForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSaved={fetchTransactions}
        defaultType={formType}
      />
    </div>
  )
}
