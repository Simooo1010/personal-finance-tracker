'use client'

import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Home, ArrowLeftRight, BarChart3, LogOut } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import { logout } from '@/app/actions'

const navItems = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/dashboard/transactions', icon: ArrowLeftRight, label: 'Transazioni' },
  { href: '/dashboard/analytics', icon: BarChart3, label: 'Analisi' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await logout()
    router.replace('/')
  }

  return (
    <aside className="hidden lg:flex flex-col w-[280px] min-w-[280px] h-dvh sticky top-0 bg-background/60 backdrop-blur-2xl border-r border-border p-8 z-20">
      {/* Brand */}
      <div className="mb-12 px-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-background" />
        </div>
        <h1 className="text-xl font-extralight tracking-[0.2em] uppercase text-foreground">
          Finance
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`relative flex items-center gap-4 px-4 py-3 rounded-2xl transition-smooth w-full text-left ${
                isActive
                  ? 'text-foreground bg-foreground/[0.03]'
                  : 'text-muted hover:text-foreground/70 hover:bg-foreground/[0.01]'
              }`}
            >
              <item.icon className="w-5 h-5 relative z-10" strokeWidth={1.2} />
              <span className="text-sm font-light tracking-wider relative z-10">
                {item.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="sidebarActive"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-foreground rounded-r-full"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer / Controls */}
      <div className="mt-auto pt-6 border-t border-border flex items-center justify-between px-2">
        <ThemeToggle />
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleLogout}
          className="p-2 flex items-center gap-2 text-muted hover:text-foreground transition-smooth text-sm font-light tracking-wider"
        >
          <span>Esci</span>
          <LogOut className="w-4 h-4" strokeWidth={1.2} />
        </motion.button>
      </div>
    </aside>
  )
}
