'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Activity, Calendar, BarChart3 } from 'lucide-react'
import { supabase, Transaction } from '@/lib/supabase'

export default function AnalyticsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTransactions = useCallback(async () => {
    const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false })
    if (data) setTransactions(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  const totalIncome  = transactions.filter(t => t.type === 'income' ).reduce((s, t) => s + Number(t.amount), 0)
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
  const total = totalIncome + totalExpense
  const incPct = total > 0 ? (totalIncome  / total) * 100 : 50
  const expPct = total > 0 ? (totalExpense / total) * 100 : 50

  const monthly = transactions.reduce<Record<string, { income: number; expense: number }>>((acc, t) => {
    const key = new Date(t.created_at).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })
    if (!acc[key]) acc[key] = { income: 0, expense: 0 }
    if (t.type === 'income') acc[key].income += Number(t.amount)
    else acc[key].expense += Number(t.amount)
    return acc
  }, {})

  const topExpenses = [...transactions]
    .filter(t => t.type === 'expense')
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 5)

  const fmt = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2 })

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-5 h-5 border border-muted/20 border-t-muted/80 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-12 py-4">

      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/10">
        <h2 className="text-[10px] tracking-[0.3em] uppercase text-muted font-normal">
          Analisi Finanziaria
        </h2>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 gap-8 border-b border-border/10 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-1.5 text-muted">
            <TrendingUp className="w-3.5 h-3.5 text-income" strokeWidth={1.5} />
            <span className="text-[9px] tracking-[0.25em] uppercase font-light">Entrate</span>
          </div>
          <h3 className="text-3xl font-thin tracking-tight text-fg">€{fmt(totalIncome)}</h3>
          <p className="text-[10px] text-muted tracking-wider">
            {transactions.filter(t => t.type === 'income').length} operazioni
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-1.5 text-muted">
            <TrendingDown className="w-3.5 h-3.5 text-expense" strokeWidth={1.5} />
            <span className="text-[9px] tracking-[0.25em] uppercase font-light">Uscite</span>
          </div>
          <h3 className="text-3xl font-thin tracking-tight text-fg">€{fmt(totalExpense)}</h3>
          <p className="text-[10px] text-muted tracking-wider">
            {transactions.filter(t => t.type === 'expense').length} operazioni
          </p>
        </motion.div>
      </div>

      {/* Ratio bar Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="space-y-4"
      >
        <div className="flex items-center gap-2 text-muted">
          <Activity className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span className="text-[10px] tracking-[0.25em] uppercase font-normal">
            Rapporto Entrate / Uscite
          </span>
        </div>
        <div className="space-y-2">
          <div className="flex rounded-full overflow-hidden h-1.5 bg-elevated">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${incPct}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="bg-income"
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${expPct}%` }}
              transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
              className="bg-expense"
            />
          </div>
          <div className="flex justify-between text-[11px] font-light tracking-wider">
            <span className="text-income">Entrate {incPct.toFixed(0)}%</span>
            <span className="text-expense">Uscite {expPct.toFixed(0)}%</span>
          </div>
        </div>
      </motion.div>

      {/* Monthly Stats Section */}
      {Object.keys(monthly).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="space-y-6"
        >
          <div className="flex items-center gap-2 text-muted pb-2 border-b border-border/10">
            <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="text-[10px] tracking-[0.25em] uppercase font-normal">
              Profilo Mensile
            </span>
          </div>
          <div className="space-y-6">
            {Object.entries(monthly).slice(0, 6).map(([month, data]) => {
              const mt = data.income + data.expense
              const ip = mt > 0 ? (data.income / mt) * 100 : 0
              const net = data.income - data.expense
              return (
                <div key={month} className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-sm font-light text-fg capitalize">{month}</span>
                    <span className={`text-sm font-light ${net >= 0 ? 'text-income' : 'text-expense'}`}>
                      {net >= 0 ? '+' : ''}€{fmt(net)}
                    </span>
                  </div>
                  <div className="flex rounded-full overflow-hidden h-1 bg-elevated">
                    <div className="bg-income" style={{ width: `${ip}%` }} />
                    <div className="bg-expense" style={{ width: `${100 - ip}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Top expenses Section */}
      {topExpenses.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="space-y-6"
        >
          <div className="flex items-center gap-2 text-muted pb-2 border-b border-border/10">
            <BarChart3 className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="text-[10px] tracking-[0.25em] uppercase font-normal">
              Classifica Uscite
            </span>
          </div>
          <div className="space-y-5">
            {topExpenses.map((t, i) => {
              const pct = totalExpense > 0 ? (Number(t.amount) / totalExpense) * 100 : 0
              return (
                <div key={t.id} className="flex items-start gap-4">
                  <span className="text-xs text-muted w-4 shrink-0 mt-0.5 font-light">{i + 1}</span>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex justify-between items-baseline">
                      <p className="text-sm font-light text-fg truncate">{t.title}</p>
                      <p className="text-sm font-normal text-expense ml-2 shrink-0">€{fmt(Number(t.amount))}</p>
                    </div>
                    <div className="h-1 rounded-full bg-elevated overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, delay: 0.2 + i * 0.05 }}
                        className="h-full bg-expense/40 rounded-full"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </div>
  )
}
