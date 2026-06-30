'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Calculator as CalcIcon, TrendingUp, TrendingDown } from 'lucide-react'
import Calculator from './Calculator'
import { Transaction } from '@/lib/supabase'
import { createClient } from '@/lib/supabaseClient'
import { parseTransaction, formatDebtTitle } from '@/lib/transactions'
import { pushAction } from '@/lib/actionsTracker'
import { useWallets } from '@/components/WalletContext'

interface TransactionFormProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  editTransaction?: Transaction | null
  defaultType?: 'income' | 'expense'
}

export default function TransactionForm({
  isOpen, onClose, onSaved, editTransaction, defaultType = 'income',
}: TransactionFormProps) {
  const { wallets, defaultWallet, hasMultipleWallets } = useWallets()
  const supabase = createClient()
  const [title,    setTitle]    = useState('')
  const [amount,   setAmount]   = useState('')
  const [type,     setType]     = useState<'income' | 'expense'>(defaultType)
  const [wallet,   setWallet]   = useState<string>(defaultWallet)
  const [createdAt, setCreatedAt] = useState('')
  const [showCalc, setShowCalc] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [mounted,  setMounted]  = useState(false)
  const [isMobile, setIsMobile] = useState(true)

  // Format date to local ISO string YYYY-MM-DDTHH:MM for input datetime-local
  const formatForInput = (dateStr?: string) => {
    const d = dateStr ? new Date(dateStr) : new Date()
    const tzOffset = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16)
  }

  // Initialize form when editing changes or opening
  useEffect(() => {
    if (isOpen) {
      if (editTransaction) {
        const parsed = parseTransaction(editTransaction)
         
        setWallet(parsed.wallet)
        setTitle(parsed.cleanTitle)
        setAmount(editTransaction.amount?.toString() || '')
        setType(editTransaction.type)
        setCreatedAt(formatForInput(editTransaction.created_at))
      } else {
         
        setWallet(defaultWallet)
        setTitle('')
        setAmount('')
        setType(defaultType)
        setCreatedAt(formatForInput())
      }
    }
  }, [isOpen, editTransaction, defaultType, defaultWallet])

  useEffect(() => {
     
    setMounted(true)
    setIsMobile(window.innerWidth < 640)
    const handleResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Scroll lock background
  useEffect(() => {
    if (isOpen && mounted) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen, mounted])

  const handleSave = async () => {
    if (!title.trim() || !amount || parseFloat(amount) <= 0) return
    setSaving(true)
    
    // Append the tag to the title or preserve debt format
    let finalTitle = ''
    if (editTransaction && editTransaction.title.startsWith('[DEBT:')) {
      const parsed = parseTransaction(editTransaction)
      if (parsed.isDebt && parsed.debtInfo) {
        finalTitle = formatDebtTitle({
          type: parsed.debtInfo.type,
          person: parsed.debtInfo.person,
          desc: title.trim(),
          status: parsed.debtInfo.status
        }, wallet)
      } else {
        finalTitle = title.trim() + ` [${wallet}]`
      }
    } else {
      finalTitle = title.trim() + ` [${wallet}]`
    }

    const payload = { 
      title: finalTitle, 
      amount: parseFloat(amount), 
      type,
      created_at: new Date(createdAt).toISOString()
    }
    
    if (editTransaction) {
      const { data } = await supabase.from('transactions').update(payload).eq('id', editTransaction.id).select()
      if (data && data[0]) {
        const parsed = parseTransaction(editTransaction)
        const typeKey = parsed.isDebt ? 'edit_debt' : 'edit_transaction'
        const label = parsed.isDebt
          ? `Modificato debito "${title.trim()}" (${parsed.debtInfo?.person})`
          : `Modificata transazione "${title.trim()}" (€${parseFloat(amount).toFixed(2)})`
        pushAction(typeKey, label, editTransaction, data[0])
      }
    } else {
      const { data } = await supabase.from('transactions').insert(payload).select()
      if (data && data[0]) {
        const parsed = parseTransaction(data[0])
        const typeKey = parsed.isDebt ? 'add_debt' : 'add_transaction'
        const label = parsed.isDebt
          ? `Aggiunto debito "${title.trim()}" (${parsed.debtInfo?.person})`
          : `Aggiunta transazione "${title.trim()}" (€${parseFloat(amount).toFixed(2)})`
        pushAction(typeKey, label, { id: data[0].id }, data[0])
      }
    }
    setSaving(false)
    onSaved()
    onClose()
    setTitle('')
    setAmount('')
  }

  if (!mounted) return null

  const panelVariants = {
    hidden: { y: isMobile ? '100%' : 20, opacity: isMobile ? 1 : 0 },
    visible: { y: 0, opacity: 1 },
    exit: { y: isMobile ? '100%' : 20, opacity: isMobile ? 0 : 0 }
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

          {/* Sheet/Modal */}
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-lg bg-surface rounded-t-[28px] sm:rounded-2xl p-6 sm:p-8 safe-b shadow-2xl border-t sm:border border-border/10"
          >
            {/* Drag handle (mobile only) */}
            <div className="w-8 h-1 bg-elevated rounded-full mx-auto mb-6 sm:hidden" />

            {/* Header row */}
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-[10px] tracking-[0.25em] uppercase font-light text-muted">
                {editTransaction ? 'Modifica Transazione' : 'Nuova Transazione'}
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-elevated text-muted hover:text-fg t"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Segmented control for Type */}
            <div className="flex gap-1 p-1 bg-elevated rounded-xl mb-6">
              <button
                onClick={() => setType('income')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-normal t cursor-pointer ${
                  type === 'income' ? 'bg-income text-white shadow-sm' : 'text-muted hover:text-fg'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" strokeWidth={2} />
                Entrata
              </button>
              <button
                onClick={() => setType('expense')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-normal t cursor-pointer ${
                  type === 'expense' ? 'bg-expense text-white shadow-sm' : 'text-muted hover:text-fg'
                }`}
              >
                <TrendingDown className="w-3.5 h-3.5" strokeWidth={2} />
                Uscita
              </button>
            </div>

            {/* Segmented control for Wallet */}
            {hasMultipleWallets && (
              <div className="mb-8">
                <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1.5">
                  {type === 'income' ? 'Deposita in' : 'Preleva da'}
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-elevated rounded-xl">
                  {wallets.map(w => (
                    <button
                      key={w.slug}
                      type="button"
                      onClick={() => setWallet(w.slug)}
                      className={`py-2 rounded-lg text-xs font-normal t cursor-pointer ${
                        wallet === w.slug ? 'bg-fg text-bg shadow-sm' : 'text-muted hover:text-fg'
                      }`}
                    >
                      {w.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Ghost Inputs Fields */}
            <div className="space-y-6 mb-8">
              {/* Name */}
              <div>
                <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1">
                  Descrizione
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="es. Stipendio, Spesa..."
                  className="w-full bg-transparent border-b border-border/30 py-2.5 text-base font-light text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg t"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1">
                  Importo
                </label>
                <div className="relative">
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 text-muted text-base font-light">€</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    className="w-full bg-transparent border-b border-border/30 pl-5 pr-10 py-2.5 text-base font-light text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg t"
                  />
                  <button
                    onClick={() => setShowCalc(true)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-elevated t"
                  >
                    <CalcIcon className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Date & Time */}
              <div>
                <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1">
                  Data e Ora
                </label>
                <input
                  type="datetime-local"
                  value={createdAt}
                  onChange={e => setCreatedAt(e.target.value)}
                  required
                  className="w-full bg-transparent border-b border-border/30 py-2.5 text-base font-light text-fg focus:outline-none focus:border-fg t"
                />
              </div>
            </div>

            {/* CTA */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={saving || !title.trim() || !amount || !createdAt}
              className={`w-full py-3.5 rounded-xl text-xs tracking-widest uppercase font-medium t disabled:opacity-40 shadow-sm ${
                type === 'income' ? 'bg-income text-white' : 'bg-expense text-white'
              }`}
            >
              {saving ? 'Salvataggio...' : editTransaction ? 'Aggiorna' : 'Salva'}
            </motion.button>
          </motion.div>
        </motion.div>
      )}

      <Calculator
        isOpen={showCalc}
        onClose={() => setShowCalc(false)}
        onConfirm={(v) => { setAmount(v.toString()); setShowCalc(false) }}
        initialValue={amount ? parseFloat(amount) : undefined}
      />
    </AnimatePresence>,
    document.body
  )
}
