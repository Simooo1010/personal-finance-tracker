'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabaseClient'
import { type Wallet, getUserWallets } from '@/lib/wallets'

interface WalletContextType {
  wallets: Wallet[]
  walletMap: Record<string, string> // slug -> display name
  walletSlugs: string[]
  defaultWallet: string
  hasMultipleWallets: boolean
  loading: boolean
  refetchWallets: () => Promise<void>
}

const WalletContext = createContext<WalletContextType>({
  wallets: [],
  walletMap: {},
  walletSlugs: [],
  defaultWallet: 'generale',
  hasMultipleWallets: false,
  loading: true,
  refetchWallets: async () => {},
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  const fetchWallets = useCallback(async () => {
    if (!userId) return
    const data = await getUserWallets(userId)
    setWallets(data)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (userId) fetchWallets()
  }, [userId, fetchWallets])

  const walletMap: Record<string, string> = {}
  wallets.forEach(w => { walletMap[w.slug] = w.name })

  const walletSlugs = wallets.map(w => w.slug)
  const defaultWallet = wallets.length > 0 ? wallets[0].slug : 'generale'
  const hasMultipleWallets = wallets.length > 1

  return (
    <WalletContext.Provider value={{
      wallets,
      walletMap,
      walletSlugs,
      defaultWallet,
      hasMultipleWallets,
      loading,
      refetchWallets: fetchWallets,
    }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallets() {
  return useContext(WalletContext)
}
