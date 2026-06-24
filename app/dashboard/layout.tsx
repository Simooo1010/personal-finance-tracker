'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/app/actions'
import BottomNav from '@/components/BottomNav'
import ThemeToggle from '@/components/ThemeToggle'
import { LogOut } from 'lucide-react'
import { logout } from '@/app/actions'
import { motion } from 'framer-motion'

import Sidebar from '@/components/Sidebar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    checkAuth().then((ok) => {
      if (!ok) {
        router.replace('/')
      } else {
        setAuthed(true)
      }
    })
  }, [router])

  const handleLogout = async () => {
    await logout()
    router.replace('/')
  }

  if (!authed) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="w-6 h-6 border border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-dvh bg-background w-full relative">
      <Sidebar />
      
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top Bar (Mobile Only) */}
        <header className="flex items-center justify-between px-6 pt-4 safe-top lg:hidden">
          <h1 className="text-lg font-extralight tracking-[0.15em] uppercase text-foreground">
            Finance
          </h1>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleLogout}
              className="p-2 text-muted hover:text-foreground transition-smooth"
              aria-label="Logout"
            >
              <LogOut className="w-5 h-5" strokeWidth={1} />
            </motion.button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-6 pb-28 lg:pb-8 lg:pt-8 overflow-y-auto">
          <div className="max-w-5xl mx-auto w-full h-full">
            {children}
          </div>
        </main>
      </div>

      {/* Bottom Navigation - Pill design with glassmorphism */}
      <BottomNav />
    </div>
  )
}

