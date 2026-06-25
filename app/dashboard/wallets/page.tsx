'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Wallet, ArrowLeftRight, Check, ArrowRight } from 'lucide-react'
import { supabase, Transaction } from '@/lib/supabase'
import { getWalletBalances, WalletType } from '@/lib/transactions'

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
            {transferHistory.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-light text-fg">
                    {cleanTransferTitle(t.title)}
                  </p>
                  <p className="text-[10px] text-muted tracking-wider">
                    {new Date(t.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })} • {new Date(t.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className="text-sm font-light text-muted">
                  €{fmt(Number(t.amount))}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}
