'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, ArrowLeftRight, Check, ArrowRight, Pencil, Trash2, X, Info } from 'lucide-react'
import { Transaction } from '@/lib/supabase'
import { getWalletBalances, parseTransaction } from '@/lib/transactions'
import { pushAction } from '@/lib/actionsTracker'
import { createClient } from '@/lib/supabaseClient'
import { useWallets } from '@/components/WalletContext'

export default function WalletsPage() {
  const { wallets, walletMap, defaultWallet, walletSlugs } = useWallets()
  const supabase = createClient()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [transferAmount, setTransferAmount] = useState('')
  const [sourceWallet, setSourceWallet] = useState<string>('')
  const [destWallet, setDestWallet] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [hasCheckedOnboarding, setHasCheckedOnboarding] = useState(false)

  useEffect(() => {
    if (wallets.length > 0 && !hasCheckedOnboarding) {
      const isHidden = localStorage.getItem('hide_wallet_onboarding') === 'true'
      if (!isHidden && wallets.length === 1 && wallets[0].slug === 'generale') {
        setShowOnboarding(true)
      }
      setHasCheckedOnboarding(true)
    }
  }, [wallets, hasCheckedOnboarding])

  const dismissOnboarding = () => {
    localStorage.setItem('hide_wallet_onboarding', 'true')
    setShowOnboarding(false)
  }

  const setupPresetWallets = async () => {
    setLoading(true)
    dismissOnboarding()
    setLoading(false)
  }

  const [editingTransfer, setEditingTransfer] = useState<{
    sourceTx: Transaction
    destTx?: Transaction
  } | null>(null)
  const [editSourceWallet, setEditSourceWallet] = useState<string>('')
  const [editDestWallet, setEditDestWallet] = useState<string>('')
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')

  useEffect(() => {
    if (wallets.length > 0) {
      if (!sourceWallet) setSourceWallet(wallets[0].slug)
      if (!destWallet && wallets.length > 1) setDestWallet(wallets[1].slug)
    }
  }, [wallets, sourceWallet, destWallet])

  const [confirmDeleteTransfer, setConfirmDeleteTransfer] = useState<{
    sourceTx: Transaction
    destTx?: Transaction
  } | null>(null)

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

  const balances = getWalletBalances(transactions, walletSlugs, defaultWallet)

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(transferAmount)
    if (isNaN(amt) || amt <= 0) return

    if (sourceWallet === destWallet) {
      alert("Seleziona due portafogli differenti.")
      return
    }

    if (balances[sourceWallet] < amt) {
      alert(`Fondi insufficienti in ${walletMap[sourceWallet] || sourceWallet}. Disponibili: €${fmt(balances[sourceWallet])}`)
      return
    }

    setSubmitting(true)
    const nowStr = new Date().toISOString()

    const sourceTx = {
      title: `Spostamento ${walletMap[sourceWallet] || sourceWallet} ➔ ${walletMap[destWallet] || destWallet} [${sourceWallet}-transfer]`,
      amount: amt,
      type: 'expense' as const,
      created_at: nowStr
    }

    const destTx = {
      title: `Spostamento ${walletMap[sourceWallet] || sourceWallet} ➔ ${walletMap[destWallet] || destWallet} [${destWallet}-transfer]`,
      amount: amt,
      type: 'income' as const,
      created_at: nowStr
    }

    const { data } = await supabase.from('transactions').insert([sourceTx, destTx]).select()
    if (data && data.length >= 2) {
      const sTx = data.find(r => r.type === 'expense')
      const dTx = data.find(r => r.type === 'income')
      if (sTx && dTx) {
        const label = `Eseguito spostamento ${walletMap[sourceWallet] || sourceWallet} ➔ ${walletMap[destWallet] || destWallet} (€${amt.toFixed(2)})`
        pushAction('add_transfer', label, { sourceId: sTx.id, destId: dTx.id }, { sourceTx: sTx, destTx: dTx })
      }
    }

    setTransferAmount('')
    setSubmitting(false)
    fetchTransactions()
  }

  const handleEditClick = (sourceTx: Transaction, destTx?: Transaction) => {
    const parsedSource = parseTransaction(sourceTx, defaultWallet)
    const parsedDest = destTx ? parseTransaction(destTx, defaultWallet) : null

    setEditingTransfer({ sourceTx, destTx })
    setEditSourceWallet(parsedSource.wallet)
    setEditDestWallet(parsedDest ? parsedDest.wallet : defaultWallet)
    setEditAmount(sourceTx.amount.toString())
    
    const d = new Date(sourceTx.created_at)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    setEditDate(`${year}-${month}-${day}T${hours}:${minutes}`)
  }

  const handleDeleteClick = (sourceTx: Transaction, destTx?: Transaction) => {
    setConfirmDeleteTransfer({ sourceTx, destTx })
  }

  const executeDeleteTransfer = async () => {
    if (!confirmDeleteTransfer) return
    const { sourceTx, destTx } = confirmDeleteTransfer
    setConfirmDeleteTransfer(null)
    setLoading(true)

    const ids = [sourceTx.id]
    if (destTx) ids.push(destTx.id)

    try {
      const { error } = await supabase.from('transactions').delete().in('id', ids)
      if (!error) {
        const parsedSource = parseTransaction(sourceTx, defaultWallet)
        const parsedDest = destTx ? parseTransaction(destTx, defaultWallet) : null
        const sourceLabel = walletMap[parsedSource.wallet] || parsedSource.wallet
        const destLabel = parsedDest ? (walletMap[parsedDest.wallet] || parsedDest.wallet) : 'Portafoglio'
        const label = `Eliminato spostamento ${sourceLabel} ➔ ${destLabel} (€${Number(sourceTx.amount).toFixed(2)})`
        pushAction('delete_transfer', label, { sourceTx, destTx }, { sourceId: sourceTx.id, destId: destTx?.id })
        fetchTransactions()
      }
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

    const parsedOrigSource = parseTransaction(editingTransfer.sourceTx, defaultWallet)
    const originalSourceWallet = parsedOrigSource.wallet
    const originalAmount = Number(editingTransfer.sourceTx.amount)

    let available = balances[editSourceWallet] || 0
    if (editSourceWallet === originalSourceWallet) {
      available += originalAmount
    }
    
    if (available < amt) {
      alert(`Fondi insufficienti in ${walletMap[editSourceWallet] || editSourceWallet}. Disponibili: €${fmt(available)}`)
      return
    }

    setSubmitting(true)
    const isoDate = new Date(editDate).toISOString()

    const updatedSource = {
      title: `Spostamento ${walletMap[editSourceWallet] || editSourceWallet} ➔ ${walletMap[editDestWallet] || editDestWallet} [${editSourceWallet}-transfer]`,
      amount: amt,
      type: 'expense' as const,
      created_at: isoDate
    }

    const updatedDest = {
      title: `Spostamento ${walletMap[editSourceWallet] || editSourceWallet} ➔ ${walletMap[editDestWallet] || editDestWallet} [${editDestWallet}-transfer]`,
      amount: amt,
      type: 'income' as const,
      created_at: isoDate
    }

    try {
      const originalSourceTx = editingTransfer.sourceTx
      const originalDestTx = editingTransfer.destTx

      const { data: updatedSourceData } = await supabase.from('transactions').update(updatedSource).eq('id', editingTransfer.sourceTx.id).select()

      let updatedDestDataRow = null
      if (editingTransfer.destTx) {
        const { data: updatedDestData } = await supabase.from('transactions').update(updatedDest).eq('id', editingTransfer.destTx.id).select()
        if (updatedDestData) updatedDestDataRow = updatedDestData[0]
      } else {
        const { data: insertedDestData } = await supabase.from('transactions').insert([updatedDest]).select()
        if (insertedDestData) updatedDestDataRow = insertedDestData[0]
      }

      if (updatedSourceData && updatedSourceData[0]) {
        const label = `Modificato spostamento in ${walletMap[editSourceWallet] || editSourceWallet} ➔ ${walletMap[editDestWallet] || editDestWallet} (€${amt.toFixed(2)})`
        pushAction('edit_transfer', label, { sourceTx: originalSourceTx, destTx: originalDestTx }, { sourceTx: updatedSourceData[0], destTx: updatedDestDataRow })
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
      {/* Onboarding Overlay */}
      <AnimatePresence>
        {showOnboarding && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-bg text-fg">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg space-y-12"
            >
              <div className="text-center space-y-3">
                <h1 className="text-3xl font-thin tracking-tight">I tuoi Portafogli</h1>
                <p className="text-muted font-light">
                  Gestisci i tuoi soldi separandoli in diversi contenitori.
                </p>
              </div>

              <div className="bg-surface rounded-3xl p-8 border border-border/5 space-y-5 shadow-2xl">
                <div className="flex items-center gap-3">
                  <div className="bg-income/10 p-2.5 rounded-full">
                    <Info className="w-6 h-6 text-income" strokeWidth={1.5} />
                  </div>
                  <h2 className="text-xl font-light">Cosa sono i Portafogli?</h2>
                </div>
                
                <div className="space-y-4 text-sm font-light text-muted leading-relaxed">
                  <p>
                    I portafogli ti permettono di separare i tuoi soldi in diversi contenitori 
                    (es. Contanti, Conto in Banca, Risparmi).
                  </p>
                  <p>
                    Attualmente hai solo il portafoglio "Generale". Vuoi configurare portafogli specifici?
                  </p>
                  <p className="text-muted/60">
                    Se non ti serve questa funzionalità, puoi semplicemente ignorarla e 
                    continuare a usare il portafoglio predefinito in qualsiasi momento.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <button
                  onClick={setupPresetWallets}
                  className="flex-1 py-4 bg-surface border border-border/20 text-fg rounded-2xl text-xs tracking-wider uppercase font-medium hover:bg-elevated t cursor-pointer"
                >
                  Configura Ora
                </button>
                
                <button
                  onClick={dismissOnboarding}
                  className="flex-1 py-4 bg-fg text-bg rounded-2xl text-xs tracking-wider uppercase font-medium hover:opacity-90 t cursor-pointer"
                >
                  Continua Senza
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/10">
        <h2 className="text-[10px] tracking-[0.3em] uppercase text-muted font-normal">
          Gestione Portafogli
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {wallets.map((w, index) => (
          <motion.div
            key={w.slug}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="card p-6 flex flex-col justify-between min-h-[140px]"
          >
            <div>
              <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block mb-2">
                {w.name}
              </span>
              <h3 className="text-3xl font-thin tracking-tight text-fg">
                €{fmt(balances[w.slug] || 0)}
              </h3>
            </div>
            {w.description && (
              <p className="text-[10px] text-muted tracking-wider mt-4">
                {w.description}
              </p>
            )}
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
                onChange={e => setSourceWallet(e.target.value)}
                className="w-full bg-elevated border border-border/10 rounded-xl px-4 py-2.5 text-xs text-fg focus:outline-none focus:border-fg t"
              >
                {wallets.map(w => (
                  <option key={w.slug} value={w.slug}>
                    {w.name} (€{fmt(balances[w.slug] || 0)})
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
                onChange={e => setDestWallet(e.target.value)}
                className="w-full bg-elevated border border-border/10 rounded-xl px-4 py-2.5 text-xs text-fg focus:outline-none focus:border-fg t"
              >
                {wallets.map(w => (
                  <option key={w.slug} value={w.slug}>
                    {w.name} (€{fmt(balances[w.slug] || 0)})
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
              const parsed = parseTransaction(t, defaultWallet)
              const counterpart = transactions.find(
                u => u.created_at === t.created_at && u.id !== t.id && u.title.endsWith('-transfer]')
              )
              const destWalletType = counterpart ? parseTransaction(counterpart, defaultWallet).wallet : null

              return (
                <div key={t.id} className="flex items-center justify-between py-4 group">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-light text-fg truncate">
                        {cleanTransferTitle(t.title)}
                      </p>
                      {destWalletType && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] tracking-wide uppercase font-light bg-elevated text-muted">
                          {walletMap[parsed.wallet] || parsed.wallet} ➔ {walletMap[destWalletType] || destWalletType}
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
                      onChange={e => setEditSourceWallet(e.target.value)}
                      className="w-full bg-elevated border border-border/10 rounded-xl px-4 py-2.5 text-xs text-fg focus:outline-none focus:border-fg t"
                    >
                      {wallets.map(w => {
                        const parsedOrigSource = parseTransaction(editingTransfer.sourceTx, defaultWallet)
                        const originalSourceWallet = parsedOrigSource.wallet
                        const originalAmount = Number(editingTransfer.sourceTx.amount)

                        let walletBal = balances[w.slug] || 0
                        if (w.slug === originalSourceWallet) {
                          walletBal += originalAmount
                        }

                        return (
                          <option key={w.slug} value={w.slug}>
                            {w.name} (€{fmt(walletBal)})
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
                      onChange={e => setEditDestWallet(e.target.value)}
                      className="w-full bg-elevated border border-border/10 rounded-xl px-4 py-2.5 text-xs text-fg focus:outline-none focus:border-fg t"
                    >
                      {wallets.map(w => {
                        const parsedOrigSource = parseTransaction(editingTransfer.sourceTx, defaultWallet)
                        const originalSourceWallet = parsedOrigSource.wallet
                        const originalAmount = Number(editingTransfer.sourceTx.amount)

                        let walletBal = balances[w.slug] || 0
                        if (w.slug === originalSourceWallet) {
                          walletBal += originalAmount
                        }

                        return (
                          <option key={w.slug} value={w.slug}>
                            {w.name} (€{fmt(walletBal)})
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

      {/* Custom Confirmation Modal for Deleting Transfer */}
      <AnimatePresence>
        {confirmDeleteTransfer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDeleteTransfer(null)}
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
                  Elimina Spostamento Interno
                </h3>
                <p className="text-xs text-muted font-light leading-relaxed max-w-xs">
                  Sei sicuro di voler eliminare definitivamente questo spostamento? I saldi originari dei portafogli coinvolti verranno ripristinati.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDeleteTransfer(null)}
                  className="flex-1 py-2.5 border border-border/20 text-muted hover:text-fg text-xs tracking-wider uppercase font-semibold rounded-xl t cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  onClick={executeDeleteTransfer}
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
