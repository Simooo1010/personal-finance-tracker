// Display money: whole euros heavy, cents hairline, € small.
// The weight contrast is the signature of the numbers (see docs/DESIGN-SYSTEM.md).
type MoneyProps = {
  amount: number
  /** Optional leading sign, rendered in the same face as the number. */
  sign?: '+' | '-'
  /** Weight of the whole-euro part. Hero 700, totals 600. */
  intWeight?: number
  /** Weight of the cents. Always the lightest, 200. */
  centsWeight?: number
  className?: string
}

export default function Money({
  amount,
  sign,
  intWeight = 700,
  centsWeight = 200,
  className = '',
}: MoneyProps) {
  if (!Number.isFinite(amount)) {
    return <span className={`font-display ${className}`}>€—</span>
  }

  // Same formatting as the pages' own fmt(), so values never change, only weight.
  const parts = amount.toLocaleString('it-IT', { minimumFractionDigits: 2 }).split(',')
  const cents = parts.pop()
  const whole = parts.join(',')

  return (
    <span className={`font-display ${className}`}>
      {sign && <span style={{ fontWeight: 400, marginRight: '0.1em' }}>{sign}</span>}
      <span style={{ fontWeight: 300, fontSize: '0.5em', marginRight: '0.2em' }}>€</span>
      <span style={{ fontWeight: intWeight }}>{whole}</span>
      <span style={{ fontWeight: centsWeight }}>,{cents}</span>
    </span>
  )
}
