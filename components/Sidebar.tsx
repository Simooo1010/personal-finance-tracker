'use client'

import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabaseClient'
import { Home, ArrowLeftRight, BarChart3, LogOut, Wallet, HandCoins } from 'lucide-react'

const navItems = [
  { href: '/dashboard',              icon: Home,           label: 'Home' },
  { href: '/dashboard/wallets',      icon: Wallet,         label: 'Portafogli' },
  { href: '/dashboard/transactions', icon: ArrowLeftRight, label: 'Transazioni' },
  { href: '/dashboard/debts',        icon: HandCoins,      label: 'Debiti' },
  { href: '/dashboard/analytics',    icon: BarChart3,      label: 'Analisi' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 h-dvh sticky top-0 bg-surface border-r border-border px-4 py-6">
      {/* Brand */}
      <div className="px-3 mb-8">
        <span className="text-sm font-light tracking-widest uppercase text-fg">Finance</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map((item) => {
          const active = pathname === item.href
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-light t w-full text-left ${
                active ? 'bg-elevated text-fg' : 'text-muted hover:text-fg hover:bg-elevated/50'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="sidebarActive"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-fg rounded-r"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <item.icon className="w-4 h-4 shrink-0" strokeWidth={active ? 2 : 1.5} />
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="flex items-center justify-end px-3 pt-4 border-t border-border">
        <button
          onClick={async () => {
            const supabase = createClient()
            await supabase.auth.signOut()
            router.push('/login')
            router.refresh()
          }}
          className="flex items-center gap-2 text-xs text-muted hover:text-fg t cursor-pointer"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.5} />
          Esci
        </button>
      </div>
    </aside>
  )
}
