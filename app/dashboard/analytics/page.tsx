'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { supabase, Transaction } from '@/lib/supabase'

export default function AnalyticsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
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
  const total = totalIncome + totalExpense
  const incomePercent = total > 0 ? (totalIncome / total) * 100 : 50
  const expensePercent = total > 0 ? (totalExpense / total) * 100 : 50

  // Group by month
  const monthlyData = transactions.reduce<Record<string, { income: number; expense: number }>>(
    (acc, t) => {
      const month = new Date(t.created_at).toLocaleDateString('it-IT', {
        month: 'short',
        year: 'numeric',
      })
      if (!acc[month]) acc[month] = { income: 0, expense: 0 }
      if (t.type === 'income') acc[month].income += Number(t.amount)
      else acc[month].expense += Number(t.amount)
      return acc
    },
    {}
  )

  // Top expenses
  const topExpenses = transactions
    .filter(t => t.type === 'expense')
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 5)

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-5 h-5 border border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="pt-6 lg:pt-0 h-full flex flex-col">
      <h2 className="text-[10px] text-muted font-light tracking-[0.3em] uppercase mb-12">
        Analisi Finanziaria
      </h2>

      <div className="space-y-16 lg:space-y-0 lg:flex lg:gap-24 flex-1">
        
        {/* Left Column */}
        <div className="space-y-16 flex-1">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-3 h-3 text-income" strokeWidth={2} />
                <span className="text-[9px] text-muted font-light tracking-[0.25em] uppercase">Entrate</span>
              </div>
              <p className="text-4xl lg:text-5xl font-extralight text-foreground">
                €{totalIncome.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-muted font-light mt-2 tracking-wider uppercase">
                {transactions.filter(t => t.type === 'income').length} Transazioni
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-3 h-3 text-expense" strokeWidth={2} />
                <span className="text-[9px] text-muted font-light tracking-[0.25em] uppercase">Uscite</span>
              </div>
              <p className="text-4xl lg:text-5xl font-extralight text-foreground">
                €{totalExpense.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-muted font-light mt-2 tracking-wider uppercase">
                {transactions.filter(t => t.type === 'expense').length} Transazioni
              </p>
            </motion.div>
          </div>

          {/* Ratio Bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-6">
              <Activity className="w-3 h-3 text-foreground/40" strokeWidth={2} />
              <span className="text-[9px] text-muted font-light tracking-[0.25em] uppercase">Rapporto E/U</span>
            </div>
            <div className="flex rounded-full overflow-hidden h-2 bg-surface-container-high">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${incomePercent}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="bg-income"
              />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${expensePercent}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                className="bg-expense"
              />
            </div>
            <div className="flex justify-between mt-4">
              <span className="text-[10px] font-light tracking-widest text-income">{incomePercent.toFixed(0)}%</span>
              <span className="text-[10px] font-light tracking-widest text-expense">{expensePercent.toFixed(0)}%</span>
            </div>
          </motion.div>
        </div>

        {/* Right Column */}
        <div className="space-y-16 flex-1">
          {/* Monthly Breakdown */}
          {Object.keys(monthlyData).length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <h3 className="text-[9px] text-muted font-light tracking-[0.25em] uppercase mb-8">
                Per Mese
              </h3>
              <div className="space-y-6">
                {Object.entries(monthlyData).slice(0, 6).map(([month, data]) => {
                  const monthTotal = data.income + data.expense
                  const incPct = monthTotal > 0 ? (data.income / monthTotal) * 100 : 0
                  return (
                    <div key={month}>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm font-light capitalize">{month}</span>
                        <span className={`text-sm font-light ${
                          data.income - data.expense >= 0 ? 'text-income' : 'text-foreground'
                        }`}>
                          {data.income - data.expense >= 0 ? '+' : ''}€{(data.income - data.expense).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex rounded-full overflow-hidden h-1 bg-surface-container-high">
                        <div className="bg-income" style={{ width: `${incPct}%` }} />
                        <div className="bg-expense" style={{ width: `${100 - incPct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}

          {/* Top Expenses */}
          {topExpenses.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h3 className="text-[9px] text-muted font-light tracking-[0.25em] uppercase mb-8">
                Top Uscite
              </h3>
              <div className="space-y-6">
                {topExpenses.map((t, i) => {
                  const pct = totalExpense > 0 ? (Number(t.amount) / totalExpense) * 100 : 0
                  return (
                    <div key={t.id} className="flex items-center gap-4 group">
                      <span className="text-[10px] text-muted font-light w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-light truncate group-hover:text-expense transition-colors">{t.title}</p>
                        <div className="flex rounded-full overflow-hidden h-1 bg-surface-container-high mt-2">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, delay: 0.3 + i * 0.1 }}
                            className="bg-expense"
                          />
                        </div>
                      </div>
                      <span className="text-sm font-light text-foreground">
                        €{Number(t.amount).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
