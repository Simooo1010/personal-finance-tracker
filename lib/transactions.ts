import { Transaction } from './supabase'

export type WalletType = 'busta' | 'fuori' | 'apple' | 'postepay'

export interface DebtInfo {
  type: 'to_me' | 'by_me' // to_me = others owe me (da riscattare / credit); by_me = I owe others (da pagare / debt)
  person: string
  desc: string
  status: 'active' | 'completed' // active = outstanding; completed = paid/redeemed
}

export interface ParsedTransaction {
  transaction: Transaction
  isDebt: boolean
  debtInfo: DebtInfo | null
  wallet: WalletType
  cleanTitle: string
}

export function parseTransaction(t: Transaction): ParsedTransaction {
  const title = t.title
  
  // 1. Check if it's a debt
  let isDebt = false
  let debtInfo: DebtInfo | null = null
  let cleanTitle = title
  
  if (title.startsWith('[DEBT:')) {
    isDebt = true
    try {
      const endJsonIndex = title.lastIndexOf('] [')
      if (endJsonIndex !== -1) {
        const jsonStr = title.substring(6, endJsonIndex)
        const info = JSON.parse(jsonStr)
        debtInfo = {
          type: info.type,
          person: info.person,
          desc: info.desc,
          status: info.status
        }
        cleanTitle = `${info.person}: ${info.desc}`
      }
    } catch (e) {
      console.error('Error parsing debt JSON:', e)
    }
  }

  // 2. Determine wallet/position
  let wallet: WalletType = 'fuori' // default fallback
  if (title.endsWith(' [busta]') || title.endsWith(' [busta-transfer]')) {
    wallet = 'busta'
  } else if (title.endsWith(' [fuori]') || title.endsWith(' [fuori-transfer]')) {
    wallet = 'fuori'
  } else if (title.endsWith(' [apple]') || title.endsWith(' [apple-transfer]')) {
    wallet = 'apple'
  } else if (title.endsWith(' [postepay]') || title.endsWith(' [postepay-transfer]')) {
    wallet = 'postepay'
  }

  // 3. Clean up the title if it's not a debt
  if (!isDebt) {
    cleanTitle = title.replace(/ \[(busta|fuori|apple|postepay|busta-transfer|fuori-transfer|apple-transfer|postepay-transfer)\]$/, '')
  }

  return {
    transaction: t,
    isDebt,
    debtInfo,
    wallet,
    cleanTitle
  }
}

export function formatDebtTitle(info: Omit<DebtInfo, 'wallet'>, wallet: WalletType): string {
  const jsonStr = JSON.stringify({
    type: info.type,
    person: info.person,
    desc: info.desc,
    status: info.status
  })
  return `[DEBT:${jsonStr}] [${wallet}]`
}

export function getTransactionEffect(t: Transaction): { income: number; expense: number } {
  const parsed = parseTransaction(t)
  if (parsed.isDebt && parsed.debtInfo) {
    if (parsed.debtInfo.status === 'completed') {
      return { income: 0, expense: 0 }
    }
    if (parsed.debtInfo.type === 'to_me') {
      // lending money: acts as an expense (reduces balance)
      return { income: 0, expense: Number(t.amount) }
    } else {
      // borrowing money: acts as an income (increases balance)
      return { income: Number(t.amount), expense: 0 }
    }
  }
  
  // Normal transactions
  if (t.type === 'income') {
    return { income: Number(t.amount), expense: 0 }
  } else {
    return { income: 0, expense: Number(t.amount) }
  }
}

export function getWalletBalances(transactions: Transaction[]): Record<WalletType, number> {
  const balances: Record<WalletType, number> = {
    busta: 0,
    fuori: 0,
    apple: 0,
    postepay: 0
  }
  
  transactions.forEach(t => {
    const parsed = parseTransaction(t)
    const effect = getTransactionEffect(t)
    balances[parsed.wallet] += (effect.income - effect.expense)
  })
  
  return balances
}
