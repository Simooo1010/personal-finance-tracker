import { Transaction } from './supabase'
import { getTransactionEffect } from './transactions'

const DAY = 86_400_000

/**
 * "The balance is a level" (Livello spec): current balance divided by the highest running
 * balance over the last 90 days. Returns null when there is nothing to measure.
 * Transfer legs are ignored (they never change the total).
 */
export function computeLevelRatio(transactions: Transaction[], defaultWallet: string, now = Date.now()): number | null {
  const real = transactions.filter(t => !t.title.endsWith('-transfer]'))
  if (real.length === 0) return null
  const sorted = [...real].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const since = now - 90 * DAY
  let running = 0
  let peak = Number.NEGATIVE_INFINITY
  for (const t of sorted) {
    const e = getTransactionEffect(t, defaultWallet)
    running += e.income - e.expense
    if (new Date(t.created_at).getTime() >= since) peak = Math.max(peak, running)
  }
  if (peak === Number.NEGATIVE_INFINITY) peak = running
  if (peak <= 0) return 0
  return Math.min(1, Math.max(0, running / peak))
}

/** Phone clamp from the spec so content stays readable. */
export function clampLevel(ratio: number | null): number {
  if (ratio === null) return 0.2
  return Math.min(0.7, Math.max(0.2, ratio))
}
