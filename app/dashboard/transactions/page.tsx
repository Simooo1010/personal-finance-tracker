'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, Search, Calculator as CalcIcon } from 'lucide-react'
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

  const handleDelete = async (id: string) => {
    await supabase.from('transactions').delete().eq('id', id)
    fetchTransactions()
  }

  const handleEdit = (tx: Transaction) => {
    setEditTx(tx)
    setShowForm(true)
  }

  const filtered = transactions.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' || t.type === filter
    return matchesSearch && matchesFilter
  })

  const totalFiltered = filtered.reduce((sum, t) => {
    return sum + (t.type === 'income' ? Number(t.amount) : -Number(t.amount))
  }, 0)

  return (
    <div className="pt-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extralight tracking-[0.15em]">
          Transazioni
        </h2>
        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowCalc(true)}
            className="p-2.5 text-muted hover:text-foreground transition-smooth"
            aria-label="Calculator"
          >
            <CalcIcon className="w-5 h-5" strokeWidth={1} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => { setEditTx(null); setShowForm(true) }}
            className="p-2.5 bg-foreground text-background rounded-full"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
          </motion.button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" strokeWidth={1} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca transazione..."
          className="w-full bg-foreground/[0.03] border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm font-light text-foreground placeholder:text-muted/50 focus:outline-none focus:border-foreground/20 transition-smooth"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['all', 'income', 'expense'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-light tracking-wider transition-smooth ${
              filter === f
                ? f === 'income'
                  ? 'bg-income/15 text-income'
                  : f === 'expense'
                  ? 'bg-expense/15 text-expense'
                  : 'bg-foreground/10 text-foreground'
                : 'text-muted'
            }`}
          >
            {f === 'all' ? 'Tutte' : f === 'income' ? 'Entrate' : 'Uscite'}
          </button>
        ))}
        <div className="flex-1" />
        <span className={`text-xs font-extralight self-center ${
          totalFiltered >= 0 ? 'text-income' : 'text-expense'
        }`}>
          €{totalFiltered.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
        </span>
      </div>

      {/* Transaction List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted font-extralight text-sm">Nessuna transazione trovata</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filtered.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                className="flex items-center justify-between py-3 px-4 bg-foreground/[0.02] rounded-2xl group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-light truncate">{t.title}</p>
                  <p className="text-[10px] text-muted font-extralight">
                    {new Date(t.created_at).toLocaleDateString('it-IT', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <p className={`text-sm font-light ${
                    t.type === 'income' ? 'text-income' : 'text-expense'
                  }`}>
                    {t.type === 'income' ? '+' : '-'}€{Number(t.amount).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                  </p>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-smooth">
                    <button
                      onClick={() => handleEdit(t)}
                      className="p-1.5 text-muted hover:text-foreground transition-smooth"
                    >
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1} />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-1.5 text-muted hover:text-expense transition-smooth"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
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
        onConfirm={() => setShowCalc(false)}
      />
    </div>
  )
}
