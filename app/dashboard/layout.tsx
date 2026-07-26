'use client'

import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import { WalletProvider } from '@/components/WalletContext'
import { AiProvider } from '@/components/AiContext'
import { usePathname } from 'next/navigation'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isFullWidth = pathname === '/dashboard/ai-chat'

  return (
    <WalletProvider>
      <AiProvider>
        <div className="min-h-dvh bg-bg text-fg flex">
          <Sidebar />
          <main className={`flex-1 pb-36 sm:pb-12 pt-4 sm:pt-6 lg:ml-64 w-full ${
            isFullWidth ? 'px-2 sm:px-6 max-w-none' : 'px-6 sm:px-12 max-w-3xl mx-auto'
          }`}>
            {children}
          </main>
          <BottomNav />
        </div>
      </AiProvider>
    </WalletProvider>
  )
}
