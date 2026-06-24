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
    <div className="pt-6 space-y-6">
      <h2 className="text-lg font-extralight tracking-[0.15em]">
        Analisi
      </h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-income" strokeWidth={1.2} />
            <span className="text-[10px] text-muted font-extralight tracking-widest uppercase">Entrate</span>
          </div>
          <p className="text-xl font-extralight text-income">
            €{totalIncome.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-muted font-extralight mt-1">
            {transactions.filter(t => t.type === 'income').length} transazioni
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass rounded-2xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-expense" strokeWidth={1.2} />
            <span className="text-[10px] text-muted font-extralight tracking-widest uppercase">Uscite</span>
          </div>
          <p className="text-xl font-extralight text-expense">
            €{totalExpense.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-muted font-extralight mt-1">
            {transactions.filter(t => t.type === 'expense').length} transazioni
          </p>
        </motion.div>
      </div>

      {/* Ratio Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-foreground/60" strokeWidth={1.2} />
          <span className="text-[10px] text-muted font-extralight tracking-widest uppercase">Rapporto Entrate/Uscite</span>
        </div>
        <div className="flex rounded-full overflow-hidden h-3 bg-foreground/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${incomePercent}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="bg-income rounded-l-full"
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${expensePercent}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
            className="bg-expense rounded-r-full"
          />
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[10px] font-extralight text-income">{incomePercent.toFixed(0)}%</span>
          <span className="text-[10px] font-extralight text-expense">{expensePercent.toFixed(0)}%</span>
        </div>
      </motion.div>

      {/* Monthly Breakdown */}
      {Object.keys(monthlyData).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-4"
        >
          <h3 className="text-[10px] text-muted font-extralight tracking-widest uppercase mb-4">
            Per Mese
          </h3>
          <div className="space-y-3">
            {Object.entries(monthlyData).slice(0, 6).map(([month, data]) => {
              const monthTotal = data.income + data.expense
              const incPct = monthTotal > 0 ? (data.income / monthTotal) * 100 : 0
              return (
                <div key={month}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-light capitalize">{month}</span>
                    <span className={`text-xs font-extralight ${
                      data.income - data.expense >= 0 ? 'text-income' : 'text-expense'
                    }`}>
                      {data.income - data.expense >= 0 ? '+' : ''}€{(data.income - data.expense).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex rounded-full overflow-hidden h-1.5 bg-foreground/5">
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
          className="glass rounded-2xl p-4"
        >
          <h3 className="text-[10px] text-muted font-extralight tracking-widest uppercase mb-4">
            Top Uscite
          </h3>
          <div className="space-y-3">
            {topExpenses.map((t, i) => {
              const pct = totalExpense > 0 ? (Number(t.amount) / totalExpense) * 100 : 0
              return (
                <div key={t.id} className="flex items-center gap-3">
                  <span className="text-[10px] text-muted font-extralight w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-light truncate">{t.title}</p>
                    <div className="flex rounded-full overflow-hidden h-1 bg-foreground/5 mt-1">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: 0.3 + i * 0.1 }}
                        className="bg-expense/60"
                      />
                    </div>
                  </div>
                  <span className="text-xs font-extralight text-expense">
                    €{Number(t.amount).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </div>
  )
}
