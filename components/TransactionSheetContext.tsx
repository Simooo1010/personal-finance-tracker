'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import TransactionForm from '@/components/TransactionForm'
import { useTransactions } from '@/components/TransactionsContext'

type SheetType = 'income' | 'expense'

const TransactionSheetContext = createContext<{ open: (type?: SheetType) => void }>({ open: () => {} })

/** One shared "new transaction" sheet, opened by the white + in the nav or by an empty state. */
export function TransactionSheetProvider({ children }: { children: ReactNode }) {
  const { upsertTransaction } = useTransactions()
  const [isOpen, setIsOpen] = useState(false)
  const [type, setType] = useState<SheetType>('expense')
  const open = useCallback((t: SheetType = 'expense') => { setType(t); setIsOpen(true) }, [])

  return (
    <TransactionSheetContext.Provider value={{ open }}>
      {children}
      <TransactionForm
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSaved={(saved) => saved && upsertTransaction(saved)}
        defaultType={type}
      />
    </TransactionSheetContext.Provider>
  )
}

export function useTransactionSheet() {
  return useContext(TransactionSheetContext)
}
