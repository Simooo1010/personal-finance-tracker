'use client'

import Money from '@/components/Money'

type FlowProps = { income: number; expense: number }

const fmt = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2 })

/**
 * Income pours in at the top; what was spent bends away to the right; what was kept falls
 * straight down (Livello spec, section 4). Geometry is the 350 x 274 SVG from the spec.
 */
export default function Flow({ income, expense }: FlowProps) {
  if (!(income > 0)) {
    return (
      <div className="rounded-[26px] border border-dashed border-outline p-6 text-center" data-testid="flow-empty">
        <p className="text-sm text-muted">Dati insufficienti</p>
      </div>
    )
  }

  const deficit = expense > income
  const saved = Math.max(0, income - expense)
  const pct = Math.round((saved / income) * 100)
  const colW = Math.max(0, Math.min(350, 350 * (saved / income)))
  const spent = `M${colW.toFixed(1)} 0 H350 V212 C262 212 ${colW.toFixed(1)} 150 ${colW.toFixed(1)} 0 Z`

  return (
    <figure className="m-0" data-testid="flow" aria-label={deficit ? 'Deficit nel periodo' : `Risparmio ${pct}%`}>
      <div className="h-11 rounded-[14px] bg-income text-bg flex items-center justify-between px-4 text-[11px] uppercase tracking-[0.25em] font-semibold">
        <span>Entrate</span>
        <Money amount={income} sign="+" intWeight={700} className="text-sm" />
      </div>
      <div className="relative mt-1.5 flow-pour" style={{ aspectRatio: '350 / 274' }}>
        <svg viewBox="0 0 350 274" className="absolute inset-0 w-full h-full" role="img" aria-hidden="true">
          {deficit ? (
            <>
              <path d="M0 0 H350 V212 C262 212 0 150 0 0 Z" className="fill-expense" />
              <rect x="1" y="1" width="348" height="150" rx="10" fill="none" className="stroke-fg" strokeDasharray="6 6" opacity="0.5" />
            </>
          ) : (
            <>
              <rect x="0" y="0" width={colW} height="274" className="fill-elevated" />
              <line x1={colW / 2} y1="0" x2={colW / 2} y2="274" className="stroke-income flow-dash-kept" strokeWidth="2" strokeDasharray="6 10" />
              <path d={spent} className="fill-expense" />
              <path d={`M${colW.toFixed(1) } 0 C${colW.toFixed(1)} 150 262 212 350 212`} fill="none" className="stroke-bg flow-dash-spent" strokeWidth="2" strokeDasharray="6 10" />
            </>
          )}
        </svg>
        {!deficit && colW > 90 && (
          <div className="absolute left-3 bottom-4 text-fg" style={{ maxWidth: `${(colW / 350) * 100 - 4}%` }}>
            <span className="text-[11px] uppercase tracking-[0.25em] text-muted block">{pct}% risparmio</span>
            <Money amount={saved} intWeight={600} className="text-sm" />
          </div>
        )}
        <div className="absolute right-3 top-6 text-right text-bg">
          <span className="text-[11px] uppercase tracking-[0.25em] block font-semibold">{deficit ? 'Deficit' : 'Uscite'}</span>
          <span className="font-display text-sm font-semibold">-€{fmt(expense)}</span>
        </div>
      </div>
      {!deficit && colW <= 90 && saved > 0 && (
        <figcaption className="mt-2 text-xs text-muted">{pct}% risparmio · €{fmt(saved)}</figcaption>
      )}
      {deficit && (
        <figcaption className="mt-2 text-xs text-muted">Uscite superiori alle entrate di €{fmt(expense - income)}</figcaption>
      )}
    </figure>
  )
}
