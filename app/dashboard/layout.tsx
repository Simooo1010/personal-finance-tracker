'use client'

import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import { WalletProvider } from '@/components/WalletContext'
import { AiProvider } from '@/components/AiContext'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <AiProvider>
        <div className="min-h-dvh bg-bg text-fg flex">
          <Sidebar />
          <main className="flex-1 px-6 sm:px-12 pb-36 sm:pb-20 pt-6 sm:pt-10 lg:ml-64 max-w-3xl mx-auto w-full">
            {children}
          </main>
          <BottomNav />
        </div>
      </AiProvider>
    </WalletProvider>
  )
}
