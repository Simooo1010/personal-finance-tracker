'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Calculator as CalcIcon, TrendingUp, TrendingDown } from 'lucide-react'
import Calculator from './Calculator'
import { supabase, Transaction } from '@/lib/supabase'

interface TransactionFormProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  editTransaction?: Transaction | null
  defaultType?: 'income' | 'expense'
}

export default function TransactionForm({
  isOpen,
  onClose,
  onSaved,
  editTransaction,
  defaultType = 'income',
}: TransactionFormProps) {
  const [title, setTitle] = useState(editTransaction?.title || '')
  const [amount, setAmount] = useState(editTransaction?.amount?.toString() || '')
  const [type, setType] = useState<'income' | 'expense'>(editTransaction?.type || defaultType)
  const [showCalc, setShowCalc] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim() || !amount || parseFloat(amount) <= 0) return
    setSaving(true)

    const data = {
      title: title.trim(),
      amount: parseFloat(amount),
      type,
    }

    if (editTransaction) {
      await supabase
        .from('transactions')
        .update(data)
        .eq('id', editTransaction.id)
    } else {
      await supabase
        .from('transactions')
        .insert(data)
    }

    setSaving(false)
    onSaved()
    onClose()
    setTitle('')
    setAmount('')
  }

  const handleCalcConfirm = (value: number) => {
    setAmount(value.toString())
    setShowCalc(false)
  }

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-end justify-center"
            onClick={onClose}
          >
            <div className="absolute inset-0 bg-black/40" />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md glass rounded-t-3xl p-6 safe-bottom"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-extralight tracking-wider">
                  {editTransaction ? 'Modifica' : 'Nuova Transazione'}
                </h2>
                <button onClick={onClose} className="p-2 text-muted">
                  <X className="w-5 h-5" strokeWidth={1} />
                </button>
              </div>

              {/* Type Toggle */}
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setType('income')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-light tracking-wider transition-smooth ${
                    type === 'income'
                      ? 'bg-income/15 text-income border border-income/30'
                      : 'bg-foreground/[0.03] text-muted border border-transparent'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" strokeWidth={1.2} />
                  Entrata
                </button>
                <button
                  onClick={() => setType('expense')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-light tracking-wider transition-smooth ${
                    type === 'expense'
                      ? 'bg-expense/15 text-expense border border-expense/30'
                      : 'bg-foreground/[0.03] text-muted border border-transparent'
                  }`}
                >
                  <TrendingDown className="w-4 h-4" strokeWidth={1.2} />
                  Uscita
                </button>
              </div>

              {/* Title Input */}
              <div className="mb-4">
                <label className="text-xs text-muted font-extralight tracking-widest uppercase mb-2 block">
                  Nome
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="es. Stipendio, Affitto..."
                  className="w-full bg-foreground/[0.03] border border-border rounded-xl px-4 py-3 text-foreground font-light placeholder:text-muted/50 focus:outline-none focus:border-foreground/20 transition-smooth"
                />
              </div>

              {/* Amount Input with Calculator */}
              <div className="mb-6">
                <label className="text-xs text-muted font-extralight tracking-widest uppercase mb-2 block">
                  Importo
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-extralight">€</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    className="w-full bg-foreground/[0.03] border border-border rounded-xl pl-8 pr-12 py-3 text-foreground font-light placeholder:text-muted/50 focus:outline-none focus:border-foreground/20 transition-smooth"
                  />
                  <button
                    onClick={() => setShowCalc(true)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-foreground transition-smooth"
                  >
                    <CalcIcon className="w-5 h-5" strokeWidth={1} />
                  </button>
                </div>
              </div>

              {/* Save Button */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSave}
                disabled={saving || !title.trim() || !amount}
                className={`w-full py-3.5 rounded-2xl text-sm font-light tracking-wider transition-smooth ${
                  type === 'income'
                    ? 'bg-income text-white'
                    : 'bg-expense text-white'
                } disabled:opacity-40`}
              >
                {saving ? 'Salvataggio...' : editTransaction ? 'Aggiorna' : 'Salva'}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Calculator
        isOpen={showCalc}
        onClose={() => setShowCalc(false)}
        onConfirm={handleCalcConfirm}
        initialValue={amount ? parseFloat(amount) : undefined}
      />
    </>
  )
}
