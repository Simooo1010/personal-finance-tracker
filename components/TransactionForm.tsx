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
              className="relative w-full max-w-md bg-surface-container-high rounded-t-3xl p-8 safe-bottom shadow-2xl"
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
              <div className="flex gap-8 mb-12">
                <button
                  onClick={() => setType('income')}
                  className={`flex items-center gap-2 pb-2 text-[10px] font-light tracking-[0.2em] uppercase transition-smooth border-b ${
                    type === 'income'
                      ? 'text-income border-income'
                      : 'text-muted border-transparent hover:text-foreground'
                  }`}
                >
                  <TrendingUp className="w-3 h-3" strokeWidth={2} />
                  Entrata
                </button>
                <button
                  onClick={() => setType('expense')}
                  className={`flex items-center gap-2 pb-2 text-[10px] font-light tracking-[0.2em] uppercase transition-smooth border-b ${
                    type === 'expense'
                      ? 'text-expense border-expense'
                      : 'text-muted border-transparent hover:text-foreground'
                  }`}
                >
                  <TrendingDown className="w-3 h-3" strokeWidth={2} />
                  Uscita
                </button>
              </div>

              {/* Title Input */}
              <div className="mb-8">
                <label className="text-[9px] text-muted font-light tracking-[0.3em] uppercase block mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="es. Stipendio, Affitto..."
                  className="ghost-input w-full py-2 text-2xl font-light placeholder:text-muted/30 text-foreground"
                />
              </div>

              {/* Amount Input with Calculator */}
              <div className="mb-12">
                <label className="text-[9px] text-muted font-light tracking-[0.3em] uppercase block mb-1">
                  Importo
                </label>
                <div className="relative">
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 text-muted font-extralight text-2xl">€</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    className="ghost-input w-full pl-6 pr-12 py-2 text-2xl font-light placeholder:text-muted/30 text-foreground"
                  />
                  <button
                    onClick={() => setShowCalc(true)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-muted hover:text-foreground transition-smooth"
                  >
                    <CalcIcon className="w-5 h-5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Save Button */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSave}
                disabled={saving || !title.trim() || !amount}
                className={`w-full py-5 rounded-full text-[10px] font-light tracking-[0.3em] uppercase transition-smooth shadow-inner-glow ${
                  type === 'income'
                    ? 'bg-income text-white'
                    : 'bg-expense text-white'
                } disabled:opacity-30`}
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
