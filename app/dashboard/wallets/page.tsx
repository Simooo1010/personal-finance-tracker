'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, ArrowLeftRight, Check, ArrowRight, Pencil, Trash2, X } from 'lucide-react'
import { supabase, Transaction } from '@/lib/supabase'
import { getWalletBalances, WalletType, parseTransaction } from '@/lib/transactions'

const walletNames: Record<WalletType, string> = {
  busta: '✉️ Busta',
  fuori: '✈️ Fuori',
  apple: '🍎 Apple Account',
  postepay: '💳 Postepay'
}

const walletDescriptions: Record<WalletType, string> = {
  busta: 'Denaro liquido protetto e archiviato',
  fuori: 'Denaro in tasca o portafoglio fisico',
  apple: 'Credito digitale account Apple',
  postepay: 'Carta prepagata Poste Italiane'
}

export default function WalletsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [transferAmount, setTransferAmount] = useState('')
  const [sourceWallet, setSourceWallet] = useState<WalletType>('fuori')
  const [destWallet, setDestWallet] = useState<WalletType>('busta')
  const [submitting, setSubmitting] = useState(false)

  const [editingTransfer, setEditingTransfer] = useState<{
    sourceTx: Transaction
    destTx?: Transaction
  } | null>(null)
  const [editSourceWallet, setEditSourceWallet] = useState<WalletType>('fuori')
  const [editDestWallet, setEditDestWallet] = useState<WalletType>('busta')
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')

  const fetchTransactions = useCallback(async () => {
    const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false })
    if (data) setTransactions(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  const balances = getWalletBalances(transactions)

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(transferAmount)
    if (isNaN(amt) || amt <= 0) return

    if (sourceWallet === destWallet) {
      alert("Seleziona due portafogli differenti.")
      return
    }

    if (balances[sourceWallet] < amt) {
      alert(`Fondi insufficienti in ${walletNames[sourceWallet]}. Disponibili: €${fmt(balances[sourceWallet])}`)
      return
    }

    setSubmitting(true)
    const nowStr = new Date().toISOString()

    const sourceTx = {
      title: `Spostamento ${walletNames[sourceWallet]} ➔ ${walletNames[destWallet]} [${sourceWallet}-transfer]`,
      amount: amt,
      type: 'expense' as const,
      created_at: nowStr
    }

    const destTx = {
      title: `Spostamento ${walletNames[sourceWallet]} ➔ ${walletNames[destWallet]} [${destWallet}-transfer]`,
      amount: amt,
      type: 'income' as const,
      created_at: nowStr
    }

    await supabase.from('transactions').insert([sourceTx, destTx])
    setTransferAmount('')
    setSubmitting(false)
    fetchTransactions()
  }

  const handleEditClick = (sourceTx: Transaction, destTx?: Transaction) => {
    const parsedSource = parseTransaction(sourceTx)
    const parsedDest = destTx ? parseTransaction(destTx) : null

    setEditingTransfer({ sourceTx, destTx })
    setEditSourceWallet(parsedSource.wallet)
    setEditDestWallet(parsedDest ? parsedDest.wallet : 'busta')
    setEditAmount(sourceTx.amount.toString())
    
    const d = new Date(sourceTx.created_at)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    setEditDate(`${year}-${month}-${day}T${hours}:${minutes}`)
  }

  const handleDeleteClick = async (sourceTx: Transaction, destTx?: Transaction) => {
    const confirmDelete = window.confirm("Sei sicuro di voler eliminare questo spostamento? Questa azione ripristinerà i saldi originari.")
    if (!confirmDelete) return

    setLoading(true)
    const ids = [sourceTx.id]
    if (destTx) ids.push(destTx.id)

    try {
      await supabase.from('transactions').delete().in('id', ids)
      fetchTransactions()
    } catch (e) {
      console.error(e)
      alert("Errore durante l'eliminazione dello spostamento.")
    } finally {
      setLoading(false)
    }
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTransfer) return

    const amt = parseFloat(editAmount)
    if (isNaN(amt) || amt <= 0) {
      alert("Inserisci un importo valido.")
      return
    }

    if (editSourceWallet === editDestWallet) {
      alert("Seleziona due portafogli differenti.")
      return
    }

    const parsedOrigSource = parseTransaction(editingTransfer.sourceTx)
    const originalSourceWallet = parsedOrigSource.wallet
    const originalAmount = Number(editingTransfer.sourceTx.amount)

    let available = balances[editSourceWallet]
    if (editSourceWallet === originalSourceWallet) {
      available += originalAmount
    }
    
    if (available < amt) {
      alert(`Fondi insufficienti in ${walletNames[editSourceWallet]}. Disponibili: €${fmt(available)}`)
      return
    }

    setSubmitting(true)
    const isoDate = new Date(editDate).toISOString()

    const updatedSource = {
      title: `Spostamento ${walletNames[editSourceWallet]} ➔ ${walletNames[editDestWallet]} [${editSourceWallet}-transfer]`,
      amount: amt,
      type: 'expense' as const,
      created_at: isoDate
    }

    const updatedDest = {
      title: `Spostamento ${walletNames[editSourceWallet]} ➔ ${walletNames[editDestWallet]} [${editDestWallet}-transfer]`,
      amount: amt,
      type: 'income' as const,
      created_at: isoDate
    }

    try {
      await supabase.from('transactions').update(updatedSource).eq('id', editingTransfer.sourceTx.id)

      if (editingTransfer.destTx) {
        await supabase.from('transactions').update(updatedDest).eq('id', editingTransfer.destTx.id)
      } else {
        await supabase.from('transactions').insert([updatedDest])
      }

      setEditingTransfer(null)
      fetchTransactions()
    } catch (err) {
      console.error(err)
      alert("Errore durante l'aggiornamento dello spostamento.")
    } finally {
      setSubmitting(false)
    }
  }

  // Filter transfers for history (only show the expense/source to avoid duplicates)
  const transferHistory = transactions.filter(t => t.title.endsWith('-transfer]') && t.type === 'expense')

  const fmt = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2 })

  const cleanTransferTitle = (title: string) => {
    return title.replace(/ \[[a-z]+-transfer\]$/, '')
  }

  return (
    <div className="space-y-12 py-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/10">
        <h2 className="text-[10px] tracking-[0.3em] uppercase text-muted font-normal">
          Gestione Portafogli
        </h2>
      </div>

      {/* Balances Grid (4 cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {(Object.keys(walletNames) as WalletType[]).map((w, index) => (
          <motion.div
            key={w}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="card p-6 flex flex-col justify-between min-h-[140px]"
          >
            <div>
              <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block mb-2">
                {walletNames[w]}
              </span>
              <h3 className="text-3xl font-thin tracking-tight text-fg">
                €{fmt(balances[w])}
              </h3>
            </div>
            <p className="text-[10px] text-muted tracking-wider mt-4">
              {walletDescriptions[w]}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Transfer Form Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card p-6 space-y-6"
      >
        <div className="flex items-center gap-2 text-muted">
          <ArrowLeftRight className="w-4 h-4" strokeWidth={1.5} />
          <span className="text-[10px] tracking-[0.25em] uppercase font-normal">
            Trasferisci Fondi Interni
          </span>
        </div>

        <form onSubmit={handleTransfer} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Source select */}
            <div>
              <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1.5">
                Da (Origine)
              </label>
              <select
                value={sourceWallet}
                onChange={e => setSourceWallet(e.target.value as WalletType)}
                className="w-full bg-elevated border border-border/10 rounded-xl px-4 py-2.5 text-xs text-fg focus:outline-none focus:border-fg t"
              >
                {(Object.keys(walletNames) as WalletType[]).map(w => (
                  <option key={w} value={w}>
                    {walletNames[w]} (€{fmt(balances[w])})
                  </option>
                ))}
              </select>
            </div>

            {/* Destination select */}
            <div>
              <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1.5">
                A (Destinazione)
              </label>
              <select
                value={destWallet}
                onChange={e => setDestWallet(e.target.value as WalletType)}
                className="w-full bg-elevated border border-border/10 rounded-xl px-4 py-2.5 text-xs text-fg focus:outline-none focus:border-fg t"
              >
                {(Object.keys(walletNames) as WalletType[]).map(w => (
                  <option key={w} value={w}>
                    {walletNames[w]} (€{fmt(balances[w])})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount input */}
          <div className="relative">
            <span className="absolute left-0 top-1/2 -translate-y-1/2 text-muted text-base font-light">€</span>
            <input
              type="number"
              value={transferAmount}
              onChange={e => setTransferAmount(e.target.value)}
              placeholder="Importo da spostare"
              step="0.01"
              required
              className="w-full bg-transparent border-b border-border/30 pl-5 pr-4 py-2.5 text-base font-light text-fg focus:outline-none focus:border-fg t"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !transferAmount || sourceWallet === destWallet}
            className="w-full py-3 bg-fg text-bg text-xs tracking-wider uppercase font-semibold rounded-xl t cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting ? 'Elaborazione...' : 'Conferma Trasferimento'}
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </form>
      </motion.div>

      {/* Transfer History Ledger */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="space-y-6"
      >
        <div className="pb-2 border-b border-border/10">
          <span className="text-[10px] tracking-[0.3em] uppercase text-muted font-normal">
            Storico Spostamenti
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 border border-muted/20 border-t-muted/80 rounded-full animate-spin" />
          </div>
        ) : transferHistory.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted font-light">Nessun trasferimento registrato</p>
          </div>
        ) : (
          <div className="divide-y divide-border/5">
            {transferHistory.map((t) => {
              const parsed = parseTransaction(t)
              const counterpart = transactions.find(
                u => u.created_at === t.created_at && u.id !== t.id && u.title.endsWith('-transfer]')
              )
              const destWalletType = counterpart ? parseTransaction(counterpart).wallet : null

              return (
                <div key={t.id} className="flex items-center justify-between py-4 group">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-light text-fg truncate">
                        {cleanTransferTitle(t.title)}
                      </p>
                      {destWalletType && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] tracking-wide uppercase font-light bg-elevated text-muted">
                          {walletNames[parsed.wallet]} ➔ {walletNames[destWalletType]}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted tracking-wider">
                      {new Date(t.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })} • {new Date(t.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 ml-3 shrink-0">
                    <span className="text-sm font-light text-muted">
                      €{fmt(Number(t.amount))}
                    </span>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-0.5 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
                      <button
                        onClick={() => handleEditClick(t, counterpart)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-elevated/60 t cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(t, counterpart)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-expense hover:bg-expense/5 t cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </motion.div>

      {/* Edit Transfer Modal Overlay */}
      <AnimatePresence>
        {editingTransfer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingTransfer(null)}
              className="absolute inset-0 bg-bg/85 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-lg card p-6 bg-surface/90 border border-border/40 shadow-2xl space-y-6 overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-border/10 pb-4">
                <div className="flex items-center gap-2 text-muted">
                  <Pencil className="w-4 h-4" strokeWidth={1.5} />
                  <span className="text-[10px] tracking-[0.25em] uppercase font-normal">
                    Modifica Spostamento
                  </span>
                </div>
                <button
                  onClick={() => setEditingTransfer(null)}
                  className="p-1.5 hover:bg-elevated rounded-lg text-muted hover:text-fg t cursor-pointer"
                >
                  <X className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Source select */}
                  <div>
                    <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1.5">
                      Da (Origine)
                    </label>
                    <select
                      value={editSourceWallet}
                      onChange={e => setEditSourceWallet(e.target.value as WalletType)}
                      className="w-full bg-elevated border border-border/10 rounded-xl px-4 py-2.5 text-xs text-fg focus:outline-none focus:border-fg t"
                    >
                      {(Object.keys(walletNames) as WalletType[]).map(w => {
                        const parsedOrigSource = parseTransaction(editingTransfer.sourceTx)
                        const originalSourceWallet = parsedOrigSource.wallet
                        const originalAmount = Number(editingTransfer.sourceTx.amount)

                        let walletBal = balances[w]
                        if (w === originalSourceWallet) {
                          walletBal += originalAmount
                        }

                        return (
                          <option key={w} value={w}>
                            {walletNames[w]} (€{fmt(walletBal)})
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  {/* Destination select */}
                  <div>
                    <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1.5">
                      A (Destinazione)
                    </label>
                    <select
                      value={editDestWallet}
                      onChange={e => setEditDestWallet(e.target.value as WalletType)}
                      className="w-full bg-elevated border border-border/10 rounded-xl px-4 py-2.5 text-xs text-fg focus:outline-none focus:border-fg t"
                    >
                      {(Object.keys(walletNames) as WalletType[]).map(w => {
                        const parsedOrigSource = parseTransaction(editingTransfer.sourceTx)
                        const originalSourceWallet = parsedOrigSource.wallet
                        const originalAmount = Number(editingTransfer.sourceTx.amount)

                        let walletBal = balances[w]
                        if (w === originalSourceWallet) {
                          walletBal += originalAmount
                        }

                        return (
                          <option key={w} value={w}>
                            {walletNames[w]} (€{fmt(walletBal)})
                          </option>
                        )
                      })}
                    </select>
                  </div>
                </div>

                {/* Amount input */}
                <div>
                  <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1">
                    Importo
                  </label>
                  <div className="relative">
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 text-muted text-sm font-light">€</span>
                    <input
                      type="number"
                      value={editAmount}
                      onChange={e => setEditAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      required
                      className="w-full bg-transparent border-b border-border/30 pl-5 pr-4 py-2 text-sm font-light text-fg focus:outline-none focus:border-fg t"
                    />
                  </div>
                </div>

                {/* Date input */}
                <div>
                  <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1">
                    Data e Ora
                  </label>
                  <input
                    type="datetime-local"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    required
                    className="w-full bg-elevated border border-border/10 rounded-xl px-4 py-2.5 text-xs text-fg focus:outline-none focus:border-fg cursor-pointer t"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingTransfer(null)}
                    className="flex-1 py-3 border border-border/20 text-muted hover:text-fg text-xs tracking-wider uppercase font-semibold rounded-xl t cursor-pointer"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !editAmount || editSourceWallet === editDestWallet}
                    className="flex-1 py-3 bg-fg text-bg text-xs tracking-wider uppercase font-semibold rounded-xl t cursor-pointer disabled:opacity-40"
                  >
                    {submitting ? 'Salvataggio...' : 'Salva Modifiche'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
