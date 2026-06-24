'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth, logout } from '@/app/actions'
import BottomNav from '@/components/BottomNav'
import Sidebar from '@/components/Sidebar'
import ThemeToggle from '@/components/ThemeToggle'
import { LogOut } from 'lucide-react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    checkAuth().then((ok) => {
      if (!ok) router.replace('/')
      else setAuthed(true)
    })
  }, [router])

  const handleLogout = async () => {
    await logout()
    router.replace('/')
  }

  if (!authed) {
    return (
      <div className="fixed inset-0 bg-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* Desktop Sidebar */}
      <Sidebar onLogout={handleLogout} />

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0 min-h-dvh">

        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-5 py-4 bg-bg border-b border-border safe-t">
          <span className="text-sm font-light tracking-widest uppercase text-fg">Finance</span>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="w-9 h-9 flex items-center justify-center rounded-full text-muted hover:text-fg t"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-8 pb-28 lg:pb-8">
          <div className="max-w-3xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  )
}
