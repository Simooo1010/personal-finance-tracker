'use client'

import { useSyncExternalStore } from 'react'

type LiquidProps = {
  /** 0.2 to 0.7: share of the phone height the liquid rises to (full variant only). */
  level?: number
  /** `full` is Home; `strip` is the 40px band behind the nav on every other screen. */
  variant?: 'full' | 'strip'
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

/**
 * The liquid body: two sine waves, a body of `elevated` colour and a thin green level line.
 * Purely decorative (aria-hidden). Offline turns the line dashed and shows an OFFLINE note.
 */
export default function Liquid({ level = 0.2, variant = 'full' }: LiquidProps) {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
  const full = variant === 'full'
  // waterTop = 844 - 60 - level * 760, expressed against the real viewport height.
  const top = full ? `calc(100dvh - 60px - ${(level * 760).toFixed(1)}px)` : 'calc(100dvh - 40px)'

  return (
    <div
      aria-hidden="true"
      data-testid={`liquid-${variant}`}
      className={`fixed inset-x-0 bottom-0 lg:left-64 ${full ? "-z-10" : "z-0"} pointer-events-none overflow-hidden ${online ? '' : 'liquid-offline'}`}
      style={{ top: 0 }}
    >
      <div className="liquid-top absolute inset-x-0 bottom-0" style={{ top }}>
        <div className="liquid-wave liquid-wave-fill liquid-wave-back" style={{ top: -12 }} />
        <div className="liquid-wave liquid-wave-fill liquid-wave-front" style={{ top: -12 }} />
        <div className="liquid-wave liquid-wave-line liquid-wave-stroke" style={{ top: -12 }} />
        <div className="absolute inset-x-0 bg-elevated" style={{ top: 12, bottom: 0 }} />
        {full && (
          <>
            <span className="liquid-bubble" style={{ left: '18%', animationDelay: '0s' }} />
            <span className="liquid-bubble" style={{ left: '52%', animationDelay: '2.4s', animationDuration: '9s' }} />
            <span className="liquid-bubble" style={{ left: '81%', animationDelay: '4.6s', animationDuration: '6s' }} />
          </>
        )}
        {!online && (
          <span className="absolute right-6 -top-6 text-[11px] uppercase tracking-[0.25em] text-muted">Offline</span>
        )}
      </div>
    </div>
  )
}
