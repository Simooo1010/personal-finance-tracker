'use client'

import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Home, ArrowLeftRight, BarChart3 } from 'lucide-react'

const navItems = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/dashboard/transactions', icon: ArrowLeftRight, label: 'Transazioni' },
  { href: '/dashboard/analytics', icon: BarChart3, label: 'Analisi' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 safe-bottom">
      <nav className="pill-nav flex items-center gap-1 px-2 py-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`relative flex items-center gap-2 px-5 py-2.5 rounded-full transition-smooth ${
                isActive
                  ? 'text-foreground'
                  : 'text-muted hover:text-foreground/70'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-foreground/8 rounded-full"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <item.icon className="w-5 h-5 relative z-10" strokeWidth={1.2} />
              {isActive && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="text-xs font-light tracking-wider relative z-10 whitespace-nowrap"
                >
                  {item.label}
                </motion.span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
