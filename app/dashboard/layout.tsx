'use client'

import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import { WalletProvider } from '@/components/WalletContext'
import { TransactionsProvider } from '@/components/TransactionsContext'
import { AiProvider } from '@/components/AiContext'
import { AiChatProvider } from '@/components/ai-chat/AiChatContext'
import { useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { motion, MotionConfig } from 'framer-motion'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isFullWidth = pathname === '/dashboard/ai-chat'
  // false on the server and during hydration, true afterwards: the first paint is the final
  // look (no dimmed page waiting for JavaScript); later section changes ease in.
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false)

  return (
    // Every entrance animation in the dashboard defaults to a short 0.06s tween so a
    // section is fully on screen well inside 200ms. Individual elements can still
    // set their own transition.
    <MotionConfig transition={{ duration: 0.06, ease: 'easeOut' }}>
      <WalletProvider>
        <TransactionsProvider>
          <AiProvider>
            <AiChatProvider>
              <div className="min-h-dvh bg-bg text-fg flex">
                <Sidebar />
                <main className={`flex-1 pb-36 sm:pb-12 pt-4 sm:pt-6 lg:ml-64 w-full ${
                  isFullWidth ? 'px-2 sm:px-6 max-w-none' : 'px-6 sm:px-12 max-w-3xl mx-auto'
                }`}>
                  {/* No exit animation and no waiting: the new section replaces the old one at once.
                      It starts at 60% (never 0%) so there is no empty frame between sections. */}
                  <motion.div
                    key={pathname}
                    initial={hydrated ? { opacity: 0.6 } : false}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.06, ease: 'easeOut' }}
                  >
                    {children}
                  </motion.div>
                </main>
                <BottomNav />
              </div>
            </AiChatProvider>
          </AiProvider>
        </TransactionsProvider>
      </WalletProvider>
    </MotionConfig>
  )
}
