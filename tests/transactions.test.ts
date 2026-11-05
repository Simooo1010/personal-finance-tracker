import { describe, expect, it } from 'vitest'
import type { Transaction } from '../lib/supabase'
import { formatDebtTitle, getTransactionEffect, getWalletBalances } from '../lib/transactions'

function transaction(id: string, title: string, amount: number, type: Transaction['type']): Transaction {
  return { id, title, amount, type, created_at: '2025-07-01T09:00:00Z' }
}

describe('ledger calculations', () => {
  it('moves money between wallets while conserving the total', () => {
    const transactions = [
      transaction('1', 'Opening balance', 100, 'income'),
      transaction('2', 'Move to savings [cash-transfer]', 30, 'expense'),
      transaction('3', 'Move to savings [savings-transfer]', 30, 'income'),
    ]
    const balances = getWalletBalances(transactions, ['cash', 'savings', 'spare'], 'cash')

    expect(balances).toEqual({ cash: 70, savings: 30, spare: 0 })
    expect(Object.values(balances).reduce((total, balance) => total + balance, 0)).toBe(100)
  })

  it.each([
    { type: 'to_me', status: 'active', income: 0, expense: 25 },
    { type: 'by_me', status: 'active', income: 25, expense: 0 },
    { type: 'to_me', status: 'completed', income: 0, expense: 0 },
    { type: 'by_me', status: 'completed', income: 0, expense: 0 },
  ] as const)('calculates the effect of a $status $type debt', ({ type, status, income, expense }) => {
    const title = formatDebtTitle({ type, status, person: 'Test contact', desc: 'Test debt' }, 'cash')

    expect(getTransactionEffect(transaction('1', title, 25, 'expense'))).toEqual({ income, expense })
  })
})
