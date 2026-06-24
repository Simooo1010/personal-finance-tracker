'use client'

import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Home, ArrowLeftRight, BarChart3 } from 'lucide-react'

const navItems = [
  { href: '/dashboard',              icon: Home,           label: 'Home' },
  { href: '/dashboard/transactions', icon: ArrowLeftRight, label: 'Transazioni' },
  { href: '/dashboard/analytics',    icon: BarChart3,      label: 'Analisi' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 lg:hidden safe-b">
      <nav className="pill-nav flex items-center gap-1 px-2 py-2">
        {navItems.map((item) => {
          const active = pathname === item.href
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`relative flex items-center gap-1.5 px-4 py-2 rounded-full t ${
                active ? 'text-fg' : 'text-muted'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="navPill"
                  className="absolute inset-0 bg-elevated rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <item.icon
                className="w-4 h-4 relative z-10"
                strokeWidth={active ? 2 : 1.5}
              />
              {active && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  className="text-xs font-normal relative z-10 whitespace-nowrap"
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
