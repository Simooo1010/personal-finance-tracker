'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth, logout } from '@/app/actions'
import BottomNav from '@/components/BottomNav'
import Sidebar from '@/components/Sidebar'
import { LogOut, Undo2, Redo2, History, X, Pencil, Check, Trash2 } from 'lucide-react'
import { getHistory, getHistoryIndex, performUndo, performRedo, clearHistory, updateActionLabel, TrackedAction } from '@/lib/actionsTracker'
import { AnimatePresence, motion } from 'framer-motion'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)

  // Actions history state
  const [history, setHistory] = useState<TrackedAction[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [showLog, setShowLog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const refreshHistory = useCallback(() => {
    setHistory(getHistory())
    setHistoryIndex(getHistoryIndex())
  }, [])

  useEffect(() => {
    checkAuth().then((ok) => {
      if (!ok) router.replace('/')
      else setAuthed(true)
    })
  }, [router])

  useEffect(() => {
    if (authed) {
      refreshHistory()
      window.addEventListener('finance_history_change', refreshHistory)
      return () => window.removeEventListener('finance_history_change', refreshHistory)
    }
  }, [authed, refreshHistory])

  const handleLogout = async () => {
    await logout()
    router.replace('/')
  }

  const handleUndo = async () => {
    await performUndo()
  }

  const handleRedo = async () => {
    await performRedo()
  }

  const handleClearHistory = () => {
    clearHistory()
    setShowClearConfirm(false)
  }

  const handleEditLabelStart = (id: string, label: string) => {
    setEditingId(id)
    setEditLabel(label)
  }

  const handleEditLabelSave = (id: string) => {
    if (editLabel.trim()) {
      updateActionLabel(id, editLabel.trim())
    }
    setEditingId(null)
  }

  if (!authed) {
    return (
      <div className="fixed inset-0 bg-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* Desktop Sidebar */}
      <Sidebar onLogout={handleLogout} />

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0 min-h-dvh">

        {/* Global sticky top bar */}
        <header className="flex items-center justify-between px-5 py-4 lg:px-8 lg:py-4 bg-surface/30 backdrop-blur-md border-b border-border/5 sticky top-0 z-40 safe-t">
          <span className="text-sm font-light tracking-widest uppercase text-fg lg:block hidden">Finance</span>
          <span className="text-sm font-light tracking-widest uppercase text-fg lg:hidden block">Finance</span>
          
          <div className="flex items-center gap-2">
            {/* Undo Arrow */}
            <button
              onClick={handleUndo}
              disabled={historyIndex < 0}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-elevated/60 disabled:opacity-30 disabled:pointer-events-none t cursor-pointer"
              title="Annulla ultima azione (Undo)"
            >
              <Undo2 className="w-4 h-4" strokeWidth={1.5} />
            </button>

            {/* Redo Arrow */}
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-elevated/60 disabled:opacity-30 disabled:pointer-events-none t cursor-pointer"
              title="Ripristina azione (Redo)"
            >
              <Redo2 className="w-4 h-4" strokeWidth={1.5} />
            </button>

            {/* History Toggle */}
            <button
              onClick={() => { setShowLog(true); setShowClearConfirm(false) }}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-elevated/60 t cursor-pointer ${
                showLog ? 'bg-elevated/50 text-fg' : ''
              }`}
              title="Registro Attività"
            >
              <History className="w-4 h-4" strokeWidth={1.5} />
            </button>

            <div className="w-px h-4 bg-border/10 mx-1 lg:block hidden" />

            {/* Logout (Desktop Only) */}
            <button
              onClick={handleLogout}
              className="w-8 h-8 lg:flex hidden items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-elevated/60 t cursor-pointer"
              title="Esci"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-8 pb-28 lg:pb-8">
          <div className="max-w-3xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />

      {/* Activity Log Drawer panel (Right side) */}
      <AnimatePresence>
        {showLog && (
          <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLog(false)}
              className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
            />

            {/* Drawer container */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="relative w-full max-w-md h-full bg-surface border-l border-border/10 shadow-2xl flex flex-col z-10"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-border/10">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-muted" strokeWidth={1.5} />
                  <h3 className="text-sm font-light tracking-wider uppercase text-fg">
                    Registro Attività
                  </h3>
                </div>
                <button
                  onClick={() => setShowLog(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-elevated/60 t cursor-pointer"
                >
                  <X className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>

              {/* Drawer Body (List of actions) */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-muted space-y-2 py-20">
                    <History className="w-8 h-8 text-muted/30" strokeWidth={1} />
                    <p className="text-xs font-light">Nessuna attività registrata</p>
                    <p className="text-[10px] text-muted/50 max-w-[200px] leading-relaxed">
                      Le modifiche apportate compariranno qui e rimarranno persistenti.
                    </p>
                  </div>
                ) : (
                  <div className="relative border-l border-border/10 pl-4 ml-2 space-y-6 py-2">
                    {/* Render actions in reverse chronological order */}
                    {[...history].reverse().map((act) => {
                      // Map the index from the reversed array back to the original index
                      const originalIndex = history.findIndex(h => h.id === act.id)
                      const isApplied = originalIndex <= historyIndex

                      return (
                        <div key={act.id} className="relative group/item">
                          {/* Timeline dot */}
                          <div className={`absolute -left-[21px] top-1.5 w-2 h-2 rounded-full border transition-all duration-300 ${
                            isApplied 
                              ? 'bg-fg border-fg scale-100' 
                              : 'bg-bg border-border/40 scale-90'
                          }`} />

                          <div className={`space-y-1 transition-opacity duration-300 ${
                            isApplied ? 'opacity-100' : 'opacity-40'
                          }`}>
                            <div className="flex items-start justify-between gap-4">
                              {editingId === act.id ? (
                                <div className="flex-1 flex items-center gap-1.5 bg-elevated/40 rounded-lg px-2.5 py-1 border border-border/20">
                                  <input
                                    type="text"
                                    value={editLabel}
                                    onChange={e => setEditLabel(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleEditLabelSave(act.id)
                                      if (e.key === 'Escape') setEditingId(null)
                                    }}
                                    autoFocus
                                    className="flex-1 bg-transparent text-xs text-fg focus:outline-none py-0.5"
                                  />
                                  <button
                                    onClick={() => handleEditLabelSave(act.id)}
                                    className="p-1 text-income hover:bg-elevated rounded t cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" strokeWidth={2} />
                                  </button>
                                </div>
                              ) : (
                                <p className="text-xs font-light text-fg leading-relaxed">
                                  {act.label}
                                </p>
                              )}

                              {editingId !== act.id && (
                                <button
                                  onClick={() => handleEditLabelStart(act.id, act.label)}
                                  className="opacity-0 group-hover/item:opacity-100 w-6 h-6 flex items-center justify-center text-muted hover:text-fg hover:bg-elevated/60 rounded-md t cursor-pointer shrink-0"
                                  title="Modifica descrizione"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            <p className="text-[9px] text-muted tracking-wider">
                              {new Date(act.timestamp).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} • {new Date(act.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Drawer Footer */}
              {history.length > 0 && (
                <div className="p-6 border-t border-border/10 bg-surface/50">
                  {showClearConfirm ? (
                    <div className="space-y-3">
                      <p className="text-[10px] text-muted leading-relaxed">
                        Questo svuoterà solo la lista del registro. Confermi?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowClearConfirm(false)}
                          className="flex-1 py-2 border border-border/20 text-muted hover:text-fg text-xs tracking-wider uppercase font-semibold rounded-xl t cursor-pointer"
                        >
                          No
                        </button>
                        <button
                          onClick={handleClearHistory}
                          className="flex-1 py-2 bg-expense text-white text-xs tracking-wider uppercase font-semibold rounded-xl hover:bg-expense/90 t cursor-pointer"
                        >
                          Sì, svuota
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      className="w-full py-3 border border-border/25 text-muted hover:text-expense hover:border-expense/40 text-xs tracking-wider uppercase font-semibold rounded-xl t cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Svuota Registro
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
