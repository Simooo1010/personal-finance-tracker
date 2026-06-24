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
    <div className="pt-6 lg:pt-0 h-full flex flex-col lg:flex-row gap-12 lg:gap-24">
      
      {/* Left Area (Balance & Actions) */}
      <div className="flex-1 space-y-12 lg:space-y-20">
        
        {/* Balance Section - Pure minimal */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative"
        >
          <p className="text-[10px] text-muted font-light tracking-[0.3em] uppercase mb-4">
            Saldo Disponibile
          </p>
          <h2 className={`text-6xl lg:text-8xl font-extralight tracking-tighter leading-none ${
            balance >= 0 ? 'text-foreground' : 'text-expense'
          }`}>
            €{balance.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h2>

          {/* Income/Expense Summary */}
          <div className="flex gap-12 mt-12">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-3 h-3 text-income" strokeWidth={2} />
                <span className="text-[9px] text-muted font-light tracking-[0.25em] uppercase">Entrate</span>
              </div>
              <p className="text-2xl lg:text-3xl font-extralight text-foreground">
                €{totalIncome.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-3 h-3 text-expense" strokeWidth={2} />
                <span className="text-[9px] text-muted font-light tracking-[0.25em] uppercase">Uscite</span>
              </div>
              <p className="text-2xl lg:text-3xl font-extralight text-foreground">
                €{totalExpense.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <div className="flex gap-4">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => openForm('income')}
            className="flex-1 flex items-center justify-center gap-2 py-5 bg-surface-container-high hover:bg-surface-variant rounded-2xl text-foreground text-xs font-light tracking-[0.2em] uppercase transition-smooth"
          >
            <Plus className="w-4 h-4 text-income" strokeWidth={1.5} />
            Aggiungi
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => openForm('expense')}
            className="flex-1 flex items-center justify-center gap-2 py-5 bg-surface-container-high hover:bg-surface-variant rounded-2xl text-foreground text-xs font-light tracking-[0.2em] uppercase transition-smooth"
          >
            <Plus className="w-4 h-4 text-expense" strokeWidth={1.5} />
            Sottrai
          </motion.button>
        </div>
      </div>

      {/* Right Area (Recent Transactions) */}
      <div className="w-full lg:w-[380px] shrink-0">
        <h2 className="text-[10px] text-muted font-light tracking-[0.25em] uppercase mb-8">
          Il Ledger
        </h2>

        {loading ? (
          <div className="py-8">
            <div className="w-4 h-4 border border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
          </div>
        ) : recentTransactions.length === 0 ? (
          <div className="py-12">
            <p className="text-muted font-extralight text-sm">Nessuna transazione</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentTransactions.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="group flex items-start justify-between py-4 border-b border-outline-variant hover:border-foreground transition-smooth"
              >
                <div>
                  <p className="text-base font-light text-foreground">{t.title}</p>
                  <p className="text-[10px] text-muted font-light tracking-wider uppercase mt-1">
                    {new Date(t.created_at).toLocaleDateString('it-IT', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                </div>
                <p className={`text-base font-light ${
                  t.type === 'income' ? 'text-income' : 'text-foreground'
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
