import { Transaction } from './supabase'

export interface DebtInfo {
  type: 'to_me' | 'by_me'
  person: string
  desc: string
  status: 'active' | 'completed'
}

export interface ParsedTransaction {
  transaction: Transaction
  isDebt: boolean
  debtInfo: DebtInfo | null
  wallet: string
  cleanTitle: string
}

// Regex to extract wallet slug from title end: matches [slug] or [slug-transfer]
const WALLET_TAG_REGEX = /\s*\[([a-zA-Z0-9_-]+?)(?:-transfer)?\]$/

export function parseTransaction(t: Transaction, defaultWallet: string = 'generale'): ParsedTransaction {
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

  // 2. Determine wallet/position dynamically using regex
  let wallet: string = defaultWallet
  
  const match = title.match(WALLET_TAG_REGEX)
  if (match) {
    wallet = match[1]
  }

  // 3. Clean up the title if it's not a debt
  if (!isDebt) {
    cleanTitle = title.replace(WALLET_TAG_REGEX, '')
  }

  return {
    transaction: t,
    isDebt,
    debtInfo,
    wallet,
    cleanTitle
  }
}

export function formatDebtTitle(info: Omit<DebtInfo, 'wallet'>, wallet: string): string {
  const jsonStr = JSON.stringify({
    type: info.type,
    person: info.person,
    desc: info.desc,
    status: info.status
  })
  return `[DEBT:${jsonStr}] [${wallet}]`
}

export function getTransactionEffect(t: Transaction, defaultWallet: string = 'generale'): { income: number; expense: number } {
  const parsed = parseTransaction(t, defaultWallet)
  if (parsed.isDebt && parsed.debtInfo) {
    if (parsed.debtInfo.status === 'completed') {
      return { income: 0, expense: 0 }
    }
    if (parsed.debtInfo.type === 'to_me') {
      return { income: 0, expense: Number(t.amount) }
    } else {
      return { income: Number(t.amount), expense: 0 }
    }
  }
  
  if (t.type === 'income') {
    return { income: Number(t.amount), expense: 0 }
  } else {
    return { income: 0, expense: Number(t.amount) }
  }
}

export function getWalletBalances(transactions: Transaction[], walletSlugs: string[], defaultWallet: string = 'generale'): Record<string, number> {
  const balances: Record<string, number> = {}
  walletSlugs.forEach(slug => { balances[slug] = 0 })
  
  transactions.forEach(t => {
    const parsed = parseTransaction(t, defaultWallet)
    const effect = getTransactionEffect(t, defaultWallet)
    if (balances[parsed.wallet] === undefined) {
      balances[parsed.wallet] = 0
    }
    balances[parsed.wallet] += (effect.income - effect.expense)
  })
  
  return balances
}
