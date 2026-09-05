'use client'

import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import { WalletProvider } from '@/components/WalletContext'
import { TransactionsProvider } from '@/components/TransactionsContext'
import { AiProvider } from '@/components/AiContext'
import { AiChatProvider } from '@/components/ai-chat/AiChatContext'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isFullWidth = pathname === '/dashboard/ai-chat'

  return (
    <WalletProvider>
      <TransactionsProvider>
        <AiProvider>
          <AiChatProvider>
            <div className="min-h-dvh bg-bg text-fg flex">
              <Sidebar />
              <main className={`flex-1 pb-36 sm:pb-12 pt-4 sm:pt-6 lg:ml-64 w-full ${
                isFullWidth ? 'px-2 sm:px-6 max-w-none' : 'px-6 sm:px-12 max-w-3xl mx-auto'
              }`}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={pathname}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>
              </main>
              <BottomNav />
            </div>
          </AiChatProvider>
        </AiProvider>
      </TransactionsProvider>
    </WalletProvider>
  )
}
