'use client'

import { useSyncExternalStore } from 'react'
import { Sun, Moon } from 'lucide-react'

type Theme = 'dark' | 'light'

function paint(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f5f5f7' : '#000000')
}

const subscribe = (cb: () => void) => {
  // Same tab: our own event. Other tabs: the storage event, so every open tab follows.
  const onStorage = (e: StorageEvent) => {
    if (e.key === 'theme') {
      paint(e.newValue === 'light' ? 'light' : 'dark')
      cb()
    }
  }
  window.addEventListener('themechange', cb)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener('themechange', cb)
    window.removeEventListener('storage', onStorage)
  }
}
const getSnapshot = (): Theme => (document.documentElement.classList.contains('light') ? 'light' : 'dark')
const getServerSnapshot = (): Theme => 'dark'

function applyTheme(theme: Theme) {
  paint(theme)
  try { localStorage.setItem('theme', theme) } catch {}
  window.dispatchEvent(new Event('themechange'))
}

/** Dark is the default; the choice is stored in localStorage and applied before first paint. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const next: Theme = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      className={`p-3 rounded-full bg-surface border border-border/10 text-fg hover:bg-elevated transition-colors cursor-pointer ${className}`}
      aria-label={next === 'light' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
      title={next === 'light' ? 'Tema chiaro' : 'Tema scuro'}
    >
      {theme === 'dark' ? <Sun className="w-5 h-5" strokeWidth={1.5} /> : <Moon className="w-5 h-5" strokeWidth={1.5} />}
    </button>
  )
}
