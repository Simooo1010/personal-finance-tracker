'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Pencil, Check, X, ArrowUpRight, ArrowDownRight, User, FileText, Calendar, Wallet } from 'lucide-react'
import { supabase, Transaction } from '@/lib/supabase'
import { parseTransaction, formatDebtTitle, WalletType, DebtInfo } from '@/lib/transactions'
import { pushAction } from '@/lib/actionsTracker'

const walletNames: Record<WalletType, string> = {
  busta: '✉️ Busta',
  fuori: '✈️ Fuori',
  apple: '🍎 Apple Account',
  postepay: '💳 Postepay'
}

export default function DebtsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  // Form Modal States
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  // Form Field States
  const [person, setPerson] = useState('')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [wallet, setWallet] = useState<WalletType>('fuori')
  const [createdAt, setCreatedAt] = useState('')
  const [debtType, setDebtType] = useState<'to_me' | 'by_me'>('to_me') // to_me: Mi devono; by_me: Devo a
  const [saving, setSaving] = useState(false)

  // Deletion confirmation
  const [confirmDeleteDebt, setConfirmDeleteDebt] = useState<any | null>(null)

  // Navigation Filter
  const [activeTab, setActiveTab] = useState<'to_me' | 'by_me' | 'completed'>('to_me')

  const fetchTransactions = useCallback(async () => {
    const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false })
    if (data) setTransactions(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTransactions()
    window.addEventListener('finance_db_changed', fetchTransactions)
    return () => window.removeEventListener('finance_db_changed', fetchTransactions)
  }, [fetchTransactions])

  // Parse all transactions to find debts
  const debtsList = useMemo(() => {
    return transactions
      .map(t => {
        const parsed = parseTransaction(t)
        return {
          id: t.id,
          rawTitle: t.title,
          amount: Number(t.amount),
          created_at: t.created_at,
          ...parsed
        }
      })
      .filter(item => item.isDebt && item.debtInfo !== null)
  }, [transactions])

  // Summaries
  const totalToRedeem = useMemo(() => {
    return debtsList
      .filter(d => d.debtInfo?.type === 'to_me' && d.debtInfo.status === 'active')
      .reduce((sum, d) => sum + d.amount, 0)
  }, [debtsList])

  const totalToPay = useMemo(() => {
    return debtsList
      .filter(d => d.debtInfo?.type === 'by_me' && d.debtInfo.status === 'active')
      .reduce((sum, d) => sum + d.amount, 0)
  }, [debtsList])

  // Split debts by category for rendering
  const activeCredits = useMemo(() => debtsList.filter(d => d.debtInfo?.type === 'to_me' && d.debtInfo?.status === 'active'), [debtsList])
  const activeDebts = useMemo(() => debtsList.filter(d => d.debtInfo?.type === 'by_me' && d.debtInfo?.status === 'active'), [debtsList])
  const completedDebts = useMemo(() => debtsList.filter(d => d.debtInfo?.status === 'completed'), [debtsList])

  const formatForInput = (dateStr?: string) => {
    const d = dateStr ? new Date(dateStr) : new Date()
    const tzOffset = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16)
  }

  const openAddForm = () => {
    setEditingId(null)
    setPerson('')
    setDesc('')
    setAmount('')
    setWallet('fuori')
    setDebtType('to_me')
    setCreatedAt(formatForInput())
    setIsOpen(true)
  }

  const openEditForm = (debt: typeof debtsList[0]) => {
    if (!debt.debtInfo) return
    setEditingId(debt.id)
    setPerson(debt.debtInfo.person)
    setDesc(debt.debtInfo.desc)
    setAmount(debt.amount.toString())
    setWallet(debt.wallet)
    setDebtType(debt.debtInfo.type)
    setCreatedAt(formatForInput(debt.created_at))
    setIsOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!person.trim() || !amount || parseFloat(amount) <= 0 || !createdAt) return
    
    setSaving(true)
    const formattedTitle = formatDebtTitle({
      type: debtType,
      person: person.trim(),
      desc: desc.trim() || 'Debito',
      status: 'active' // Newly created or edited from form defaults to active unless completed otherwise
    }, wallet)

    // A debt to me (lending) acts as an expense in DB, debt I owe (borrowing) acts as an income in DB
    const dbType = debtType === 'to_me' ? 'expense' : 'income'

    const payload = {
      title: formattedTitle,
      amount: parseFloat(amount),
      type: dbType,
      created_at: new Date(createdAt).toISOString()
    }

    if (editingId) {
      const originalTx = transactions.find(t => t.id === editingId)
      const existing = debtsList.find(d => d.id === editingId)
      const existingStatus = existing?.debtInfo?.status || 'active'
      const updatedTitle = formatDebtTitle({
        type: debtType,
        person: person.trim(),
        desc: desc.trim() || 'Debito',
        status: existingStatus
      }, wallet)
      
      const { data } = await supabase.from('transactions').update({
        title: updatedTitle,
        amount: parseFloat(amount),
        type: dbType,
        created_at: new Date(createdAt).toISOString()
      }).eq('id', editingId).select()

      if (data && data[0] && originalTx) {
        const label = `Modificato debito "${desc.trim() || 'Debito'}" (${person.trim()})`
        pushAction('edit_debt', label, originalTx, data[0])
      }
    } else {
      const { data } = await supabase.from('transactions').insert(payload).select()
      if (data && data[0]) {
        const label = `Aggiunto debito "${desc.trim() || 'Debito'}" (${person.trim()})`
        pushAction('add_debt', label, { id: data[0].id }, data[0])
      }
    }

    setSaving(false)
    setIsOpen(false)
    fetchTransactions()
  }

  const handleDelete = (id: string) => {
    const debt = debtsList.find(d => d.id === id)
    if (debt) {
      setConfirmDeleteDebt(debt)
    }
  }

  const executeDeleteDebt = async () => {
    if (!confirmDeleteDebt) return
    const debt = confirmDeleteDebt
    setConfirmDeleteDebt(null)
    setLoading(true)

    const txToDelete = transactions.find(t => t.id === debt.id)
    if (!txToDelete) {
      setLoading(false)
      return
    }

    try {
      const { error } = await supabase.from('transactions').delete().eq('id', debt.id)
      if (!error) {
        const label = `Eliminato debito "${debt.debtInfo?.desc}" (${debt.debtInfo?.person})`
        pushAction('delete_debt', label, txToDelete, { id: debt.id })
        fetchTransactions()
      }
    } catch (e) {
      console.error(e)
      alert("Errore durante l'eliminazione del debito.")
    } finally {
      setLoading(false)
    }
  }

  const handleToggleStatus = async (debt: typeof debtsList[0]) => {
    if (!debt.debtInfo) return
    const newStatus = debt.debtInfo.status === 'active' ? 'completed' : 'active'
    
    const updatedTitle = formatDebtTitle({
      ...debt.debtInfo,
      status: newStatus
    }, debt.wallet)

    const originalTx = transactions.find(t => t.id === debt.id)

    const { data } = await supabase.from('transactions').update({
      title: updatedTitle
    }).eq('id', debt.id).select()

    if (data && data[0] && originalTx) {
      const actionLabel = newStatus === 'completed'
        ? `Riscattato debito "${debt.debtInfo.desc}" (${debt.debtInfo.person})`
        : `Ripristinato debito "${debt.debtInfo.desc}" (${debt.debtInfo.person})`
      pushAction('toggle_debt', actionLabel, originalTx, data[0])
      fetchTransactions()
    }
  }

  const fmt = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2 })

  const displayedList = useMemo(() => {
    if (activeTab === 'to_me') return activeCredits
    if (activeTab === 'by_me') return activeDebts
    return completedDebts
  }, [activeTab, activeCredits, activeDebts, completedDebts])

  return (
    <div className="space-y-12 py-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/10">
        <h2 className="text-[10px] tracking-[0.3em] uppercase text-muted font-normal">
          Gestione Debiti
        </h2>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={openAddForm}
          className="flex items-center gap-1.5 px-4 py-2 bg-fg text-bg rounded-full text-xs font-medium hover:opacity-90 t cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          Nuovo
        </motion.button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Credits Metric Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-6 flex flex-col justify-between min-h-[140px] border-l-2 border-l-income"
        >
          <div>
            <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block mb-2">
              Crediti (Mi Devono)
            </span>
            <h3 className="text-3xl font-thin tracking-tight text-income">
              €{fmt(totalToRedeem)}
            </h3>
          </div>
          <p className="text-[10px] text-muted tracking-wider mt-4">
            Denaro prestato da riscuotere
          </p>
        </motion.div>

        {/* Debts Metric Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card p-6 flex flex-col justify-between min-h-[140px] border-l-2 border-l-expense"
        >
          <div>
            <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block mb-2">
              Debiti (Devo Pagare)
            </span>
            <h3 className="text-3xl font-thin tracking-tight text-expense">
              €{fmt(totalToPay)}
            </h3>
          </div>
          <p className="text-[10px] text-muted tracking-wider mt-4">
            Denaro preso in prestito da restituire
          </p>
        </motion.div>
      </div>

      {/* Tabs Selection */}
      <div className="flex gap-6 border-b border-border/10 pb-3 overflow-x-auto scrollbar-none">
        {(['to_me', 'by_me', 'completed'] as const).map(tab => {
          const label = tab === 'to_me' 
            ? `Mi Devono (${activeCredits.length})` 
            : tab === 'by_me' 
            ? `Devo Dare (${activeDebts.length})` 
            : `Chiusi (${completedDebts.length})`
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-[10px] tracking-[0.25em] uppercase font-normal pb-2 border-b-2 t shrink-0 cursor-pointer ${
                activeTab === tab 
                  ? 'border-fg text-fg font-medium' 
                  : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Debts List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border border-muted/20 border-t-muted/80 rounded-full animate-spin" />
        </div>
      ) : displayedList.length === 0 ? (
        <div className="py-12 text-center card bg-surface/50 border border-border/5">
          <p className="text-sm text-muted font-light">Nessuna registrazione in questa sezione</p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {displayedList.map((debt, index) => {
              const info = debt.debtInfo!
              const isCompleted = info.status === 'completed'
              const walletLabel = walletNames[debt.wallet] || debt.wallet

              return (
                <motion.div
                  key={debt.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ delay: index * 0.02 }}
                  className="card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface hover:border-border/20 t"
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-medium text-fg truncate">{info.person}</h4>
                      <span className="px-1.5 py-0.5 rounded text-[8px] tracking-wide uppercase font-light bg-elevated text-muted">
                        {walletLabel}
                      </span>
                      {isCompleted && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] tracking-wide uppercase font-semibold bg-income/10 text-income">
                          Risolto
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm font-light text-muted">{info.desc}</p>
                    
                    <p className="text-[10px] text-muted/60 tracking-wider">
                      Registrato il {new Date(debt.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0">
                    <span className={`text-xl font-light ${info.type === 'to_me' ? 'text-income' : 'text-expense'} ${isCompleted ? 'line-through opacity-40' : ''}`}>
                      €{fmt(debt.amount)}
                    </span>

                    <div className="flex items-center gap-1">
                      {/* Toggle status / redeem button */}
                      <button
                        onClick={() => handleToggleStatus(debt)}
                        className={`w-9 h-9 flex items-center justify-center rounded-xl border border-border/10 t cursor-pointer ${
                          isCompleted
                            ? 'bg-elevated text-muted hover:text-fg'
                            : info.type === 'to_me'
                            ? 'bg-income/10 text-income hover:bg-income hover:text-white border-income/20'
                            : 'bg-expense/10 text-expense hover:bg-expense hover:text-white border-expense/20'
                        }`}
                        title={isCompleted ? 'Riapri debito' : info.type === 'to_me' ? 'Segna come riscosso' : 'Segna come restituito'}
                      >
                        <Check className="w-4 h-4" strokeWidth={2.5} />
                      </button>

                      {/* Edit */}
                      <button
                        onClick={() => openEditForm(debt)}
                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-elevated text-muted hover:text-fg border border-border/5 t cursor-pointer"
                        title="Modifica"
                      >
                        <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(debt.id)}
                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-elevated text-muted hover:text-expense hover:bg-expense/5 border border-border/5 t cursor-pointer"
                        title="Elimina"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Add / Edit Debt Modal Sheet */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setIsOpen(false)}
          >
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

            {/* Modal content */}
            <motion.div
              initial={{ y: '100%', opacity: 1 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              onClick={e => e.stopPropagation()}
              className="relative w-full max-w-lg bg-surface rounded-t-[28px] sm:rounded-2xl p-6 sm:p-8 safe-b shadow-2xl border-t sm:border border-border/10"
            >
              {/* Drag handle (mobile only) */}
              <div className="w-8 h-1 bg-elevated rounded-full mx-auto mb-6 sm:hidden" />

              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-[10px] tracking-[0.25em] uppercase font-light text-muted">
                  {editingId ? 'Modifica Registrazione' : 'Nuovo Debito/Credito'}
                </h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-elevated text-muted hover:text-fg t"
                >
                  <X className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                {/* Segmented Control for Debt Type */}
                <div className="flex gap-1 p-1 bg-elevated rounded-xl">
                  <button
                    type="button"
                    onClick={() => setDebtType('to_me')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-normal t cursor-pointer ${
                      debtType === 'to_me' ? 'bg-income text-white shadow-sm' : 'text-muted hover:text-fg'
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Mi devono soldi (Credito)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDebtType('by_me')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-normal t cursor-pointer ${
                      debtType === 'by_me' ? 'bg-expense text-white shadow-sm' : 'text-muted hover:text-fg'
                    }`}
                  >
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    Devo dei soldi (Debito)
                  </button>
                </div>

                {/* Form inputs */}
                <div className="space-y-5">
                  {/* Person Name */}
                  <div>
                    <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1">
                      Chi
                    </label>
                    <div className="relative">
                      <User className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/40" />
                      <input
                        type="text"
                        value={person}
                        onChange={e => setPerson(e.target.value)}
                        placeholder="Nome della persona"
                        required
                        className="w-full bg-transparent border-b border-border/30 pl-6 py-2.5 text-base font-light text-fg placeholder:text-muted/30 focus:outline-none focus:border-fg t"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1">
                      Descrizione
                    </label>
                    <div className="relative">
                      <FileText className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/40" />
                      <input
                        type="text"
                        value={desc}
                        onChange={e => setDesc(e.target.value)}
                        placeholder="es. Cena, Spesa, Regalo..."
                        className="w-full bg-transparent border-b border-border/30 pl-6 py-2.5 text-base font-light text-fg placeholder:text-muted/30 focus:outline-none focus:border-fg t"
                      />
                    </div>
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
                        required
                        className="w-full bg-transparent border-b border-border/30 pl-6 py-2.5 text-base font-light text-fg placeholder:text-muted/30 focus:outline-none focus:border-fg t"
                      />
                    </div>
                  </div>

                  {/* Wallet selection */}
                  <div>
                    <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1.5">
                      {debtType === 'to_me' ? 'Portafoglio (Da cui sono usciti)' : 'Portafoglio (In cui entrano)'}
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-elevated rounded-xl">
                      {(['busta', 'fuori', 'apple', 'postepay'] as const).map(w => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setWallet(w)}
                          className={`py-2 rounded-lg text-xs font-normal t cursor-pointer ${
                            wallet === w ? 'bg-fg text-bg shadow-sm' : 'text-muted hover:text-fg'
                          }`}
                        >
                          {walletNames[w]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Date & Time */}
                  <div>
                    <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1">
                      Data
                    </label>
                    <div className="relative">
                      <input
                        type="datetime-local"
                        value={createdAt}
                        onChange={e => setCreatedAt(e.target.value)}
                        required
                        className="w-full bg-transparent border-b border-border/30 py-2.5 text-base font-light text-fg focus:outline-none focus:border-fg t"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={saving || !person.trim() || !amount || !createdAt}
                  className={`w-full py-3.5 rounded-xl text-xs tracking-widest uppercase font-medium t disabled:opacity-40 shadow-sm text-white ${
                    debtType === 'to_me' ? 'bg-income' : 'bg-expense'
                  }`}
                >
                  {saving ? 'Salvataggio...' : 'Salva'}
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Modal for Deleting Debt */}
      <AnimatePresence>
        {confirmDeleteDebt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDeleteDebt(null)}
              className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md card p-6 bg-surface/90 border border-border/40 shadow-2xl space-y-6 text-center"
            >
              <div className="flex flex-col items-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-expense/10 flex items-center justify-center text-expense">
                  <Trash2 className="w-6 h-6" strokeWidth={1.5} />
                </div>
                <h3 className="text-base font-light text-fg">
                  Elimina Registrazione Debito
                </h3>
                <p className="text-xs text-muted font-light leading-relaxed max-w-xs">
                  Sei sicuro di voler eliminare definitivamente questa registrazione di debito? Questa azione ripristinerà il saldo originario.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDeleteDebt(null)}
                  className="flex-1 py-2.5 border border-border/20 text-muted hover:text-fg text-xs tracking-wider uppercase font-semibold rounded-xl t cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  onClick={executeDeleteDebt}
                  className="flex-1 py-2.5 bg-expense text-white text-xs tracking-wider uppercase font-semibold rounded-xl hover:bg-expense/90 t cursor-pointer"
                >
                  Elimina
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
