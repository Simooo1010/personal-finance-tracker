'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Home, ArrowLeftRight, BarChart3, Wallet, HandCoins, Plus } from 'lucide-react'
import { useAi } from '@/components/AiContext'
import { SparkleIcon } from '@/components/SparkleIcon'
import { useTransactionSheet } from '@/components/TransactionSheetContext'
const originalNavItems = [
  { href: '/dashboard',              icon: Home,           label: 'Home' },
  { href: '/dashboard/wallets',      icon: Wallet,         label: 'Portafogli' },
  { href: '/dashboard/transactions', icon: ArrowLeftRight, label: 'Transazioni' },
  { href: '/dashboard/debts',        icon: HandCoins,      label: 'Debiti' },
  { href: '/dashboard/analytics',    icon: BarChart3,      label: 'Analisi' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { isAiEnabled, loading } = useAi()
  const { open } = useTransactionSheet()

  const navItems = isAiEnabled ? [
    { href: '/dashboard',              icon: Home,           label: 'Home' },
    { href: '/dashboard/activity',     icon: ArrowLeftRight, label: 'Attività' },
    { href: '/dashboard/analytics',    icon: BarChart3,      label: 'Analisi' },
    { href: '/dashboard/ai-chat',      icon: SparkleIcon,    label: 'AI Chat' },
  ] : originalNavItems

  // Warm every section up front so a tap swaps pages without a network round trip.
  const hrefsKey = navItems.map(i => i.href).join(',')
  useEffect(() => {
    [...hrefsKey.split(','), '/dashboard/log'].forEach(h => router.prefetch(h))
  }, [router, hrefsKey])

  if (loading) return null // Wait for AI context to load to avoid flickering

  const mid = Math.ceil(navItems.length / 2)
  const renderItem = (item: (typeof navItems)[number]) => {
    const active = pathname === item.href
    return (
      <button
        key={item.href}
        onClick={() => router.push(item.href)}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        className={`relative flex items-center justify-center gap-1.5 min-h-11 min-w-11 px-3 rounded-full t cursor-pointer ${
          active ? 'bg-fg text-bg' : 'text-muted'
        }`}
      >
        <item.icon className="w-4 h-4" strokeWidth={active ? 2 : 1.5} />
        {active && <span className="text-xs font-bold whitespace-nowrap">{item.label}</span>}
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 lg:hidden safe-b">
      <nav className="pill-nav flex items-center gap-1 px-2 h-16" aria-label="Navigazione principale">
        {navItems.slice(0, mid).map(renderItem)}
        <button
          type="button"
          onClick={() => open('expense')}
          aria-label="Nuova operazione"
          className="w-14 h-14 rounded-full bg-fg text-bg flex items-center justify-center shrink-0 cursor-pointer"
        >
          <Plus className="w-6 h-6" strokeWidth={2} />
        </button>
        {navItems.slice(mid).map(renderItem)}
      </nav>
    </div>
  )
}
