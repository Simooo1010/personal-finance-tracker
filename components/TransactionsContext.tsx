'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabaseClient'
import { Transaction } from '@/lib/supabase'

interface TransactionsContextType {
  transactions: Transaction[]
  loading: boolean
  refetch: () => Promise<void>
  upsertTransaction: (t: Transaction) => void
  removeTransaction: (id: string) => void
  removeTransactions: (ids: string[]) => void
}

const TransactionsContext = createContext<TransactionsContextType>({
  transactions: [],
  loading: true,
  refetch: async () => {},
  upsertTransaction: () => {},
  removeTransaction: () => {},
  removeTransactions: () => {},
})

export function TransactionsProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTransactions = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (data) setTransactions(data)
    setLoading(false)
  }, [])

  useEffect(() => {

    fetchTransactions()
    window.addEventListener('finance_db_changed', fetchTransactions)
    return () => window.removeEventListener('finance_db_changed', fetchTransactions)
  }, [fetchTransactions])

  const upsertTransaction = useCallback((t: Transaction) => {
    setTransactions(prev => {
      const idx = prev.findIndex(x => x.id === t.id)
      const next = idx === -1 ? [t, ...prev] : prev.map(x => x.id === t.id ? t : x)
      return next.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    })
  }, [])

  const removeTransaction = useCallback((id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id))
  }, [])

  const removeTransactions = useCallback((ids: string[]) => {
    const idSet = new Set(ids)
    setTransactions(prev => prev.filter(t => !idSet.has(t.id)))
  }, [])

  return (
    <TransactionsContext.Provider value={{
      transactions,
      loading,
      refetch: fetchTransactions,
      upsertTransaction,
      removeTransaction,
      removeTransactions,
    }}>
      {children}
    </TransactionsContext.Provider>
  )
}

export function useTransactions() {
  return useContext(TransactionsContext)
}
