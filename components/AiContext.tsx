'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { createClient, getLocalUser } from '@/lib/supabaseClient'

interface AiContextType {
  isAiEnabled: boolean
  loading: boolean
}

const AiContext = createContext<AiContextType>({
  isAiEnabled: false,
  loading: true,
})

export function AiProvider({ children }: { children: ReactNode }) {
  const [isAiEnabled, setIsAiEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    getLocalUser(supabase).then((user) => {
      if (user && user.email === 'smndiraimondo@gmail.com') {
        setIsAiEnabled(true)
      }
      setLoading(false)
    })
  }, [])

  return (
    <AiContext.Provider value={{ isAiEnabled, loading }}>
      {children}
    </AiContext.Provider>
  )
}

export function useAi() {
  return useContext(AiContext)
}
