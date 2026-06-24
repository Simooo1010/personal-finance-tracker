'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PinLock from '@/components/PinLock'
import { checkAuth } from './actions'

export default function LockPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    checkAuth().then((authed) => {
      if (authed) {
        router.replace('/dashboard')
      } else {
        setChecking(false)
      }
    })
  }, [router])

  if (checking) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="w-6 h-6 border border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
      </div>
    )
  }

  return <PinLock onSuccess={() => router.replace('/dashboard')} />
}
