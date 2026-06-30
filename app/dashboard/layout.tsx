'use client'

import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import { WalletProvider } from '@/components/WalletContext'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <div className="min-h-dvh bg-bg text-fg flex">
        <Sidebar />
        <main className="flex-1 px-6 sm:px-12 pb-28 sm:pb-12 pt-6 sm:pt-10 lg:ml-64 max-w-3xl mx-auto w-full">
          {children}
        </main>
        <BottomNav />
      </div>
    </WalletProvider>
  )
}
