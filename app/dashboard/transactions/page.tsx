'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, Search, Calculator as CalcIcon, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { supabase, Transaction } from '@/lib/supabase'
import TransactionForm from '@/components/TransactionForm'
import Calculator from '@/components/Calculator'

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [showCalc, setShowCalc] = useState(false)

  const fetchTransactions = useCallback(async () => {
    const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false })
    if (data) setTransactions(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  const handleDelete = async (id: string) => {
    await supabase.from('transactions').delete().eq('id', id)
    fetchTransactions()
  }

  const filtered = transactions
    .filter(t => !t.title.endsWith('-transfer]'))
    .filter(t => {
      const matchSearch = t.title.toLowerCase().includes(search.toLowerCase())
      const matchFilter = filter === 'all' || t.type === filter
      return matchSearch && matchFilter
    })

  const net = filtered.reduce((s, t) => s + (t.type === 'income' ? Number(t.amount) : -Number(t.amount)), 0)
  const fmt = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2 })

  return (
    <div className="space-y-10 py-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] tracking-[0.3em] uppercase text-muted font-normal">
          Il Ledger
        </h2>
        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => setShowCalc(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-elevated/50 text-muted hover:text-fg hover:bg-elevated t cursor-pointer"
          >
            <CalcIcon className="w-4 h-4" strokeWidth={1.5} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => { setEditTx(null); setShowForm(true) }}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-fg text-bg hover:opacity-90 t cursor-pointer"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
          </motion.button>
        </div>
      </div>

      {/* Selection Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="pb-4"
      >
        <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block mb-1">
          Bilancio Selezione
        </span>
        <h1 className={`text-4xl font-thin tracking-tight ${net >= 0 ? 'text-fg' : 'text-expense'}`}>
          {net >= 0 ? '+' : '-'}€{fmt(Math.abs(net))}
        </h1>
      </motion.div>

      {/* Search Input (Ghost Style) */}
      <div className="relative">
        <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/50" strokeWidth={1.5} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca transazioni..."
          className="w-full bg-transparent border-b border-border/20 pl-7 pr-4 py-3 text-sm font-light text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg t"
        />
      </div>

      {/* Filters chips */}
      <div className="flex items-center gap-2">
        {(['all', 'income', 'expense'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-normal t cursor-pointer ${
              filter === f
                ? 'bg-fg text-bg shadow-sm'
                : 'text-muted hover:text-fg hover:bg-elevated/45'
            }`}
          >
            {f === 'all' ? 'Tutte' : f === 'income' ? 'Entrate' : 'Uscite'}
          </button>
        ))}
      </div>

      {/* Transactions List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-5 h-5 border border-muted/20 border-t-muted/80 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted font-light">Nessuna transazione trovata</p>
        </div>
      ) : (
        <div className="divide-y divide-border/5">
          <AnimatePresence mode="popLayout">
            {filtered.map((t, i) => {
              const cleanTitle = t.title.replace(/ \[(busta|fuori|busta-transfer|fuori-transfer)\]$/, '')
              return (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ delay: i * 0.02 }}
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
                      <p className="text-sm font-light text-fg truncate">{cleanTitle}</p>
                      <p className="text-[10px] text-muted tracking-wider mt-0.5">
                        {new Date(t.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })} • {new Date(t.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                <div className="flex items-center gap-3 ml-3">
                  <span className={`text-sm font-light ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                    {t.type === 'income' ? '+' : '-'}€{fmt(Number(t.amount))}
                  </span>
                  
                  {/* Subtle actions */}
                  <div className="flex items-center gap-0.5 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={() => { setEditTx(t); setShowForm(true) }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-elevated/60 t cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-expense hover:bg-expense/5 t cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )})}
          </AnimatePresence>
        </div>
      )}

      <TransactionForm
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditTx(null) }}
        onSaved={fetchTransactions}
        editTransaction={editTx}
      />
      <Calculator
        isOpen={showCalc}
        onClose={() => setShowCalc(false)}
        onConfirm={(v) => {
          // If form is open, update amount; otherwise, trigger new expense with this amount
          if (showForm) {
            // Calculator inside form handles it
          } else {
            setEditTx(null)
            setShowForm(true)
            // Wait a tick for form to open and get initial amount
            setTimeout(() => {
              // We pass it to the state
            }, 0)
          }
          setShowCalc(false)
        }}
      />
    </div>
  )
}
