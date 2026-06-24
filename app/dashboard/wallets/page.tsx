'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Wallet, ArrowLeftRight, Check, ArrowRight } from 'lucide-react'
import { supabase, Transaction } from '@/lib/supabase'

export default function WalletsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [transferAmount, setTransferAmount] = useState('')
  const [transferDirection, setTransferDirection] = useState<'to_fuori' | 'to_busta'>('to_fuori')
  const [submitting, setSubmitting] = useState(false)

  const fetchTransactions = useCallback(async () => {
    const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false })
    if (data) setTransactions(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // Calculation of Busta and Fuori balances
  const getBustaBalance = () => {
    return transactions.reduce((acc, t) => {
      const isBusta = t.title.endsWith(' [busta]') || t.title.endsWith(' [busta-transfer]')
      if (!isBusta) return acc
      const amt = Number(t.amount)
      return acc + (t.type === 'income' ? amt : -amt)
    }, 0)
  }

  const getFuoriBalance = () => {
    return transactions.reduce((acc, t) => {
      const isBusta = t.title.endsWith(' [busta]') || t.title.endsWith(' [busta-transfer]')
      if (isBusta) return acc
      const amt = Number(t.amount)
      return acc + (t.type === 'income' ? amt : -amt)
    }, 0)
  }

  const bustaVal = getBustaBalance()
  const fuoriVal = getFuoriBalance()

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(transferAmount)
    if (isNaN(amt) || amt <= 0) return

    // Quick validation check
    if (transferDirection === 'to_fuori' && bustaVal < amt) {
      alert("Fondi insufficienti in Busta.")
      return
    }
    if (transferDirection === 'to_busta' && fuoriVal < amt) {
      alert("Fondi insufficienti fuori.")
      return
    }

    setSubmitting(true)
    const nowStr = new Date().toISOString()

    const sourceTx = {
      title: transferDirection === 'to_fuori' 
        ? 'Spostamento Busta ➔ Tasche [busta-transfer]' 
        : 'Spostamento Tasche ➔ Busta [fuori-transfer]',
      amount: amt,
      type: 'expense' as const,
      created_at: nowStr
    }

    const destTx = {
      title: transferDirection === 'to_fuori' 
        ? 'Spostamento Busta ➔ Tasche [fuori-transfer]' 
        : 'Spostamento Tasche ➔ Busta [busta-transfer]',
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
    return title
      .replace(' [busta-transfer]', '')
      .replace(' [fuori-transfer]', '')
  }

  return (
    <div className="space-y-12 py-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/10">
        <h2 className="text-[10px] tracking-[0.3em] uppercase text-muted font-normal">
          Gestione Portafogli
        </h2>
      </div>

      {/* Balances Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Busta Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-6 flex flex-col justify-between min-h-[140px]"
        >
          <div>
            <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block mb-2">
              ✉️ Deposito Busta
            </span>
            <h3 className="text-3xl font-thin tracking-tight text-fg">
              €{fmt(bustaVal)}
            </h3>
          </div>
          <p className="text-[10px] text-muted tracking-wider mt-4">
            Denaro liquido protetto e archiviato
          </p>
        </motion.div>

        {/* Fuori Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card p-6 flex flex-col justify-between min-h-[140px]"
        >
          <div>
            <span className="text-[9px] tracking-[0.25em] uppercase text-muted font-normal block mb-2">
              ✈️ Fuori / In Tasca / Carte
            </span>
            <h3 className="text-3xl font-thin tracking-tight text-fg">
              €{fmt(fuoriVal)}
            </h3>
          </div>
          <p className="text-[10px] text-muted tracking-wider mt-4">
            Denaro in circolazione, portafoglio o carte
          </p>
        </motion.div>
      </div>

      {/* Transfer Form Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card p-6 space-y-6"
      >
        <div className="flex items-center gap-2 text-muted">
          <ArrowLeftRight className="w-4 h-4" strokeWidth={1.5} />
          <span className="text-[10px] tracking-[0.25em] uppercase font-normal">
            Trasferisci Fondi Interni
          </span>
        </div>

        <form onSubmit={handleTransfer} className="space-y-6">
          {/* Direction toggle */}
          <div className="flex gap-1.5 p-1 bg-elevated rounded-xl">
            <button
              type="button"
              onClick={() => setTransferDirection('to_fuori')}
              className={`flex-1 py-2.5 rounded-lg text-xs font-normal t cursor-pointer ${
                transferDirection === 'to_fuori' ? 'bg-fg text-bg shadow-sm' : 'text-muted hover:text-fg'
              }`}
            >
              ✉️ Busta ➔ ✈️ Tasca (Preleva)
            </button>
            <button
              type="button"
              onClick={() => setTransferDirection('to_busta')}
              className={`flex-1 py-2.5 rounded-lg text-xs font-normal t cursor-pointer ${
                transferDirection === 'to_busta' ? 'bg-fg text-bg shadow-sm' : 'text-muted hover:text-fg'
              }`}
            >
              ✈️ Tasca ➔ ✉️ Busta (Deposita)
            </button>
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
            disabled={submitting || !transferAmount}
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
        transition={{ delay: 0.15 }}
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
            {transferHistory.map((t, i) => (
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
