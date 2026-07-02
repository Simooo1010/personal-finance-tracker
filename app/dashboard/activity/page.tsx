'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, Search, Calculator as CalcIcon, ArrowUpRight, ArrowDownRight, ArrowLeftRight, X } from 'lucide-react'
import { Transaction } from '@/lib/supabase'
import TransactionForm from '@/components/TransactionForm'
import Calculator from '@/components/Calculator'
import { parseTransaction, getTransactionEffect, getWalletBalances } from '@/lib/transactions'
import { createClient } from '@/lib/supabaseClient'
import { useWallets } from '@/components/WalletContext'
import { pushAction } from '@/lib/actionsTracker'
import { createWallet, updateWallet, deleteWallet } from '@/lib/wallets'

export default function ActivityPage() {
  const { wallets, walletMap, defaultWallet, walletSlugs, hasMultipleWallets, refetchWallets } = useWallets()
  const supabase = createClient()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  // Wallet Form States
  const [showWalletForm, setShowWalletForm] = useState(false)
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null)
  const [walletName, setWalletName] = useState('')
  const [walletDesc, setWalletDesc] = useState('')
  const [walletEmoji, setWalletEmoji] = useState('💰')
  const [savingWallet, setSavingWallet] = useState(false)
  const [confirmDeleteWallet, setConfirmDeleteWallet] = useState<{ id: string, name: string } | null>(null)

  // Transfer States
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferAmount, setTransferAmount] = useState('')
  const [sourceWallet, setSourceWallet] = useState<string>('')
  const [destWallet, setDestWallet] = useState<string>('')
  const [submittingTransfer, setSubmittingTransfer] = useState(false)
  const [editingTransfer, setEditingTransfer] = useState<{ sourceTx: Transaction, destTx?: Transaction } | null>(null)
  const [confirmDeleteTransfer, setConfirmDeleteTransfer] = useState<{ sourceTx: Transaction, destTx?: Transaction } | null>(null)

  // Transaction Ledger States
  const [showTxForm, setShowTxForm] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [walletFilter, setWalletFilter] = useState<string>('all')
  const [showCalc, setShowCalc] = useState(false)

  const fetchTransactions = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (data) setTransactions(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTransactions()
    window.addEventListener('finance_db_changed', fetchTransactions)
    return () => window.removeEventListener('finance_db_changed', fetchTransactions)
  }, [fetchTransactions])

  useEffect(() => {
    if (wallets.length > 0 && showTransferModal) {
      if (!sourceWallet) setSourceWallet(wallets[0].slug)
      if (!destWallet && wallets.length > 1) setDestWallet(wallets[1].slug)
    }
  }, [wallets, showTransferModal, sourceWallet, destWallet])

  const balances = getWalletBalances(transactions, walletSlugs, defaultWallet)
  const fmt = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2 })

  // --- Wallet Logic ---
  const handleSaveWallet = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!walletName.trim()) return
    setSavingWallet(true)
    const fullName = `${walletEmoji} ${walletName.trim()}`
    try {
      if (editingWalletId) {
        await updateWallet(editingWalletId, {
          name: fullName,
          description: walletDesc.trim() || null
        })
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const slug = walletName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
          if (!slug || wallets.some(w => w.slug === slug)) {
            alert('Nome non valido o portafoglio già esistente')
            setSavingWallet(false)
            return
          }
          await createWallet(user.id, {
            slug,
            name: fullName,
            description: walletDesc.trim() || null,
            position: wallets.length
          })
        }
      }
      await refetchWallets()
      setShowWalletForm(false)
      setWalletName('')
      setWalletDesc('')
      setWalletEmoji('💰')
    } catch (err) {
      console.error(err)
    } finally {
      setSavingWallet(false)
    }
  }

  const handleEditWalletClick = (w: any) => {
    setEditingWalletId(w.id)
    const match = w.name.match(/^([\u2000-\u32FF\ud83c-\udbff\udc00-\udfff\u200d\ufe0f]+)\s+(.*)$/)
    if (match) {
      setWalletEmoji(match[1])
      setWalletName(match[2])
    } else {
      setWalletEmoji('💰')
      setWalletName(w.name)
    }
    setWalletDesc(w.description || '')
    setShowWalletForm(true)
  }

  const handleDeleteWallet = async () => {
    if (!confirmDeleteWallet) return
    setLoading(true)
    try {
      const walletToDel = wallets.find(w => w.id === confirmDeleteWallet.id)
      if (walletToDel) {
        // Find transactions belonging to this wallet to delete
        const txToDelete = transactions.filter(t => parseTransaction(t, defaultWallet).wallet === walletToDel.slug)
        if (txToDelete.length > 0) {
          await supabase.from('transactions').delete().in('id', txToDelete.map(t => t.id))
        }
        await deleteWallet(confirmDeleteWallet.id)
        await refetchWallets()
        await fetchTransactions()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setConfirmDeleteWallet(null)
      setLoading(false)
    }
  }

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(transferAmount)
    if (isNaN(amt) || amt <= 0 || sourceWallet === destWallet) return

    const origAmount = editingTransfer ? Number(editingTransfer.sourceTx.amount) : 0
    const sourceBalLimit = balances[sourceWallet] + (sourceWallet === (editingTransfer ? parseTransaction(editingTransfer.sourceTx, defaultWallet).wallet : '') ? origAmount : 0)

    if (sourceBalLimit < amt) {
      alert(`Fondi insufficienti in ${walletMap[sourceWallet] || sourceWallet}.`)
      return
    }

    setSubmittingTransfer(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (editingTransfer) {
      const origSource = editingTransfer.sourceTx
      const origDest = editingTransfer.destTx

      const updatedSource = {
        title: `Spostamento ${walletMap[sourceWallet] || sourceWallet} ➔ ${walletMap[destWallet] || destWallet} [${sourceWallet}-transfer]`,
        amount: amt,
        type: 'expense' as const,
      }

      const updatedDest = {
        title: `Spostamento ${walletMap[sourceWallet] || sourceWallet} ➔ ${walletMap[destWallet] || destWallet} [${destWallet}-transfer]`,
        amount: amt,
        type: 'income' as const,
      }

      await supabase.from('transactions').update(updatedSource).eq('id', origSource.id)
      if (origDest) {
        await supabase.from('transactions').update(updatedDest).eq('id', origDest.id)
      } else {
        await supabase.from('transactions').insert([{
          ...updatedDest,
          user_id: user?.id,
          created_at: origSource.created_at
        }])
      }

      const label = `Modificato spostamento ${walletMap[sourceWallet] || sourceWallet} ➔ ${walletMap[destWallet] || destWallet} (€${amt.toFixed(2)})`
      pushAction('edit_transfer', label, { sourceTx: origSource, destTx: origDest }, { sourceTx: { ...origSource, ...updatedSource }, destTx: origDest ? { ...origDest, ...updatedDest } : null })
      setEditingTransfer(null)
    } else {
      const nowStr = new Date().toISOString()
      const sourceTx = {
        user_id: user?.id,
        title: `Spostamento ${walletMap[sourceWallet] || sourceWallet} ➔ ${walletMap[destWallet] || destWallet} [${sourceWallet}-transfer]`,
        amount: amt,
        type: 'expense' as const,
        created_at: nowStr
      }

      const destTx = {
        user_id: user?.id,
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
    }

    setTransferAmount('')
    setShowTransferModal(false)
    setSubmittingTransfer(false)
    fetchTransactions()
  }

  const handleEditTransferClick = (sourceTx: Transaction, destTx?: Transaction) => {
    const parsedSource = parseTransaction(sourceTx, defaultWallet)
    const parsedDest = destTx ? parseTransaction(destTx, defaultWallet) : null

    setEditingTransfer({ sourceTx, destTx })
    setSourceWallet(parsedSource.wallet)
    setDestWallet(parsedDest ? parsedDest.wallet : defaultWallet)
    setTransferAmount(sourceTx.amount.toString())
    setShowTransferModal(true)
  }

  const handleDeleteTransferClick = (sourceTx: Transaction, destTx?: Transaction) => {
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
    } finally {
      setLoading(false)
    }
  }

  // --- Transaction Ledger Logic ---
  const handleDeleteTx = async (id: string) => {
    const txToDelete = transactions.find(t => t.id === id)
    if (!txToDelete) return
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (!error) {
      const parsed = parseTransaction(txToDelete, defaultWallet)
      const label = parsed.isDebt
        ? `Eliminato debito "${parsed.cleanTitle}" (${parsed.debtInfo?.person})`
        : `Eliminata transazione "${parsed.cleanTitle}" (€${Number(txToDelete.amount).toFixed(2)})`
      pushAction(parsed.isDebt ? 'delete_debt' : 'delete_transaction', label, txToDelete, { id: txToDelete.id })
      fetchTransactions()
    }
  }

  const filteredTx = transactions
    .filter(t => !t.title.endsWith('-transfer]'))
    .filter(t => {
      const parsed = parseTransaction(t, defaultWallet)
      const matchSearch = parsed.cleanTitle.toLowerCase().includes(search.toLowerCase())
      const matchFilter = filter === 'all' || t.type === filter
      const matchWallet = walletFilter === 'all' || parsed.wallet === walletFilter
      return matchSearch && matchFilter && matchWallet
    })

  return (
    <div className="space-y-12 py-4">
      {/* Wallet Carousel Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-[10px] tracking-[0.3em] uppercase text-muted font-normal">
            Portafogli
          </h2>
          <div className="flex gap-3">
            {wallets.length > 1 && (
              <button
                onClick={() => setShowTransferModal(true)}
                className="flex items-center gap-1 text-[9px] tracking-[0.2em] uppercase text-fg hover:opacity-80 transition-opacity cursor-pointer font-medium"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" /> Trasferisci
              </button>
            )}
            <button
              onClick={() => { setEditingWalletId(null); setWalletName(''); setWalletDesc(''); setShowWalletForm(true); }}
              className="flex items-center gap-1 text-[9px] tracking-[0.2em] uppercase text-fg hover:opacity-80 transition-opacity cursor-pointer font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Aggiungi
            </button>
          </div>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-none">
          {wallets.map((w, index) => (
            <motion.div
              key={w.slug}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="card min-w-[260px] max-w-[300px] flex-shrink-0 snap-center p-6 flex flex-col justify-between min-h-[140px] group relative"
            >
              <div>
                <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block mb-2">
                  {w.name}
                </span>
                <h3 className="text-3xl font-thin tracking-tight text-fg">
                  €{fmt(balances[w.slug] || 0)}
                </h3>
              </div>
              <p className="text-[10px] text-muted tracking-wider mt-4 truncate">
                {w.description || 'Nessuna descrizione'}
              </p>
              
              {/* Wallet Actions (visible on hover) */}
              <div className="absolute top-4 right-4 flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEditWalletClick(w)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface/50 text-muted hover:text-fg t cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setConfirmDeleteWallet({ id: w.id, name: w.name })}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface/50 text-muted hover:text-expense t cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Transaction Ledger Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-border/10">
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
              onClick={() => { setEditTx(null); setShowTxForm(true) }}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-fg text-bg hover:opacity-90 t cursor-pointer"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
            </motion.button>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-4 pb-2">
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

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
              {(['all', 'income', 'expense'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-xs font-normal shrink-0 t cursor-pointer ${
                    filter === f ? 'bg-fg text-bg shadow-sm' : 'text-muted hover:text-fg hover:bg-elevated/45'
                  }`}
                >
                  {f === 'all' ? 'Tutte' : f === 'income' ? 'Entrate' : 'Uscite'}
                </button>
              ))}
            </div>

            {hasMultipleWallets && (
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
                <button
                  onClick={() => setWalletFilter('all')}
                  className={`px-4 py-1.5 rounded-full text-xs font-normal shrink-0 t cursor-pointer ${
                    walletFilter === 'all' ? 'bg-fg text-bg shadow-sm' : 'text-muted hover:text-fg hover:bg-elevated/45'
                  }`}
                >
                  Tutti
                </button>
                {wallets.map(w => (
                  <button
                    key={w.slug}
                    onClick={() => setWalletFilter(w.slug)}
                    className={`px-4 py-1.5 rounded-full text-xs font-normal shrink-0 t cursor-pointer ${
                      walletFilter === w.slug ? 'bg-fg text-bg shadow-sm' : 'text-muted hover:text-fg hover:bg-elevated/45'
                    }`}
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Transactions List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 border border-muted/20 border-t-muted/80 rounded-full animate-spin" />
          </div>
        ) : filteredTx.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted font-light">Nessuna transazione trovata</p>
          </div>
        ) : (
          <div className="divide-y divide-border/5">
            <AnimatePresence mode="popLayout">
              {filteredTx.map((t, i) => {
                const parsed = parseTransaction(t, defaultWallet)
                const walletLabel = walletMap[parsed.wallet] || parsed.wallet
                return (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    className="flex items-center justify-between py-4 group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        t.type === 'income' ? 'bg-income/5 text-income' : 'bg-expense/5 text-expense'
                      }`}>
                        {t.type === 'income' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-light text-fg truncate">{parsed.cleanTitle}</p>
                          <span className="px-1.5 py-0.5 rounded text-[8px] tracking-wide uppercase font-light bg-elevated text-muted">
                            {walletLabel}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted tracking-wider mt-0.5">
                          {new Date(t.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 ml-3 shrink-0">
                      <span className={`text-sm font-light ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                        {t.type === 'income' ? '+' : '-'}€{fmt(Number(t.amount))}
                      </span>
                      
                      <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditTx(t); setShowTxForm(true) }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-elevated/60 t cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTx(t.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-expense hover:bg-expense/5 t cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Storico Spostamenti Section */}
      <section className="space-y-6">
        <div className="pb-3 border-b border-border/10">
          <h2 className="text-[10px] tracking-[0.3em] uppercase text-muted font-normal">
            Storico Spostamenti
          </h2>
        </div>

        {(() => {
          const transferHistory = transactions.filter(t => t.title.endsWith('-transfer]') && t.type === 'expense')
          
          if (transferHistory.length === 0) {
            return (
              <div className="py-10 text-center">
                <p className="text-sm text-muted font-light">Nessun trasferimento registrato</p>
              </div>
            )
          }

          return (
            <div className="divide-y divide-border/5">
              {transferHistory.map((t) => {
                const parsed = parseTransaction(t, defaultWallet)
                const counterpart = transactions.find(
                  u => u.created_at === t.created_at && u.id !== t.id && u.title.endsWith('-transfer]')
                )
                const destWalletType = counterpart ? parseTransaction(counterpart, defaultWallet).wallet : null
                
                const cleanTransferTitle = (title: string) => {
                  return title.replace(/\[.*-transfer\]/, '').trim()
                }

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
                      
                      <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEditTransferClick(t, counterpart)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-elevated/60 t cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={() => handleDeleteTransferClick(t, counterpart)}
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
          )
        })()}
      </section>

      {/* Forms & Modals */}
      <TransactionForm
        isOpen={showTxForm}
        onClose={() => { setShowTxForm(false); setEditTx(null) }}
        onSaved={fetchTransactions}
        editTransaction={editTx}
      />
      <Calculator
        isOpen={showCalc}
        onClose={() => setShowCalc(false)}
        onConfirm={() => {
          if (!showTxForm) {
            setEditTx(null)
            setShowTxForm(true)
          }
          setShowCalc(false)
        }}
      />

      {/* Add/Edit Wallet Form */}
      <AnimatePresence>
        {showWalletForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowWalletForm(false)} className="absolute inset-0 bg-bg/85 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 15 }} className="relative w-full max-w-lg card p-6 bg-surface/90 border border-border/40 shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-border/10 pb-4">
                <span className="text-[10px] tracking-[0.25em] uppercase font-normal">{editingWalletId ? 'Modifica Portafoglio' : 'Nuovo Portafoglio'}</span>
                <button onClick={() => setShowWalletForm(false)} className="p-1.5 hover:bg-elevated rounded-lg text-muted hover:text-fg"><X className="w-4 h-4"/></button>
              </div>
              <form onSubmit={handleSaveWallet} className="space-y-5">
                <div>
                  <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1.5">Emoji</label>
                  <div className="flex flex-wrap gap-2 p-2 bg-elevated/40 rounded-xl">
                    {['💰', '💳', '💼', '🐷', '💵', '🏦', '🪙', '🛍️', '📈', '🏠', '🚗'].map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setWalletEmoji(emoji)}
                        className={`w-9 h-9 text-lg flex items-center justify-center rounded-lg hover:bg-elevated transition-colors ${
                          walletEmoji === emoji ? 'bg-elevated border border-border/20' : ''
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1.5">Nome</label>
                  <input type="text" value={walletName} onChange={e => setWalletName(e.target.value)} required className="w-full bg-transparent border-b border-border/30 px-2 py-2 text-sm text-fg focus:outline-none focus:border-fg t" />
                </div>
                <div>
                  <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1.5">Descrizione</label>
                  <input type="text" value={walletDesc} onChange={e => setWalletDesc(e.target.value)} className="w-full bg-transparent border-b border-border/30 px-2 py-2 text-sm text-fg focus:outline-none focus:border-fg t" />
                </div>
                <button type="submit" disabled={savingWallet || !walletName.trim()} className="w-full py-3 bg-fg text-bg text-xs tracking-wider uppercase font-semibold rounded-xl t disabled:opacity-40">{savingWallet ? 'Salvataggio...' : 'Salva'}</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transfer Modal */}
      <AnimatePresence>
        {showTransferModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTransferModal(false)} className="absolute inset-0 bg-bg/85 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 15 }} className="relative w-full max-w-lg card p-6 bg-surface/90 border border-border/40 shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-border/10 pb-4">
                <span className="text-[10px] tracking-[0.25em] uppercase font-normal">Trasferisci Fondi</span>
                <button onClick={() => setShowTransferModal(false)} className="p-1.5 hover:bg-elevated rounded-lg text-muted hover:text-fg"><X className="w-4 h-4"/></button>
              </div>
              <form onSubmit={handleTransfer} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1.5">Da</label>
                    <select value={sourceWallet} onChange={e => setSourceWallet(e.target.value)} className="w-full bg-elevated rounded-xl px-3 py-2.5 text-xs focus:outline-none">
                      {wallets.map(w => <option key={w.slug} value={w.slug}>{w.name} (€{fmt(balances[w.slug] || 0)})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1.5">A</label>
                    <select value={destWallet} onChange={e => setDestWallet(e.target.value)} className="w-full bg-elevated rounded-xl px-3 py-2.5 text-xs focus:outline-none">
                      {wallets.map(w => <option key={w.slug} value={w.slug}>{w.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] tracking-[0.2em] uppercase text-muted block mb-1.5">Importo</label>
                  <input type="number" step="0.01" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} required className="w-full bg-transparent border-b border-border/30 px-2 py-2 text-sm text-fg focus:outline-none focus:border-fg t" />
                </div>
                <button type="submit" disabled={submittingTransfer || !transferAmount || sourceWallet === destWallet} className="w-full py-3 bg-fg text-bg text-xs tracking-wider uppercase font-semibold rounded-xl t disabled:opacity-40">{submittingTransfer ? 'Elaborazione...' : 'Conferma Trasferimento'}</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Wallet Confirm */}
      <AnimatePresence>
        {confirmDeleteWallet && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirmDeleteWallet(null)} className="absolute inset-0 bg-bg/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="relative w-full max-w-md card p-6 bg-surface/90 border border-border/40 shadow-2xl space-y-6 text-center">
              <h3 className="text-base font-light text-fg">Elimina {confirmDeleteWallet.name}?</h3>
              <p className="text-xs text-muted font-light">Eliminando questo portafoglio, eliminerai anche tutte le transazioni associate.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDeleteWallet(null)} className="flex-1 py-2.5 border border-border/20 text-muted hover:text-fg text-xs uppercase rounded-xl">Annulla</button>
                <button onClick={handleDeleteWallet} className="flex-1 py-2.5 bg-expense text-white text-xs uppercase rounded-xl">Elimina</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Transfer Confirm */}
      <AnimatePresence>
        {confirmDeleteTransfer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirmDeleteTransfer(null)} className="absolute inset-0 bg-bg/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="relative w-full max-w-md card p-6 bg-surface/90 border border-border/40 shadow-2xl space-y-6 text-center">
              <h3 className="text-base font-light text-fg">Elimina Spostamento?</h3>
              <p className="text-xs text-muted font-light">
                Sei sicuro di voler eliminare questo trasferimento di €{fmt(Number(confirmDeleteTransfer.sourceTx.amount))}?
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDeleteTransfer(null)} className="flex-1 py-2.5 border border-border/20 text-muted hover:text-fg text-xs uppercase rounded-xl">Annulla</button>
                <button onClick={executeDeleteTransfer} className="flex-1 py-2.5 bg-expense text-white text-xs uppercase rounded-xl">Elimina</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
