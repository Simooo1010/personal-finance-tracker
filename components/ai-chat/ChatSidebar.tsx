'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Loader2, MessageSquare, PanelLeftClose, Edit3, Check, X, Trash2 } from 'lucide-react'
import { SparkleIcon } from '@/components/SparkleIcon'
import { useAiChat, type ChatSession } from '@/components/ai-chat/AiChatContext'

function groupSessions(sessions: ChatSession[]) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - 7)

  const groups: { label: string; sessions: ChatSession[] }[] = [
    { label: 'Oggi', sessions: [] },
    { label: 'Ieri', sessions: [] },
    { label: 'Precedenti 7 giorni', sessions: [] },
    { label: 'Meno recenti', sessions: [] },
  ]

  for (const s of sessions) {
    const updated = new Date(s.updated_at)
    if (updated >= startOfToday) groups[0].sessions.push(s)
    else if (updated >= startOfYesterday) groups[1].sessions.push(s)
    else if (updated >= startOfWeek) groups[2].sessions.push(s)
    else groups[3].sessions.push(s)
  }

  return groups.filter(g => g.sessions.length > 0)
}

export function ChatSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const {
    sessions, loadingSessions, activeSessionId, setActiveSessionId,
    startNewChat, renameSession, deleteSession, isStreaming,
  } = useAiChat()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editedTitle, setEditedTitle] = useState('')
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null)

  const startRename = (s: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(s.id)
    setEditedTitle(s.title)
  }

  const saveRename = (id: string, e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (editedTitle.trim()) renameSession(id, editedTitle.trim())
    setEditingId(null)
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Sei sicuro di voler eliminare questa conversazione?')) return
    const result = await deleteSession(id)
    if (!result.ok && result.reason) {
      setDeleteNotice(result.reason)
      setTimeout(() => setDeleteNotice(null), 3000)
    }
  }

  const groups = groupSessions(sessions)

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 288, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className="h-full bg-surface flex flex-col shrink-0 overflow-hidden z-20"
        >
          <div className="w-[288px] flex flex-col h-full p-3 gap-3">
            <div className="flex items-center justify-between px-1 pt-1 pb-1">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br from-fg to-income shrink-0">
                  <SparkleIcon className="w-3 h-3 text-bg" />
                </div>
                <span className="text-sm font-semibold tracking-tight">Sparkle</span>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-muted hover:text-fg rounded-full transition-colors cursor-pointer sm:hidden"
                title="Nascondi barra laterale"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={startNewChat}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-elevated hover:bg-elevated/80 text-fg rounded-full text-xs font-medium t cursor-pointer"
            >
              <Plus className="w-4 h-4 text-income" />
              <span>Nuova Chat</span>
            </button>

            <div className="flex-1 overflow-y-auto space-y-4 scrollbar-none -mx-1 px-1">
              {loadingSessions ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-4 h-4 animate-spin text-muted" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-8 px-4 text-xs text-muted/60 font-light">
                  Nessuna chat precedente. Inizia ora!
                </div>
              ) : (
                groups.map(group => (
                  <div key={group.label} className="space-y-1">
                    <div className="px-3 text-[10.5px] font-semibold tracking-wider uppercase text-muted/50">
                      {group.label}
                    </div>
                    {group.sessions.map(s => {
                      const isActive = s.id === activeSessionId
                      const isEditing = editingId === s.id
                      const generating = isStreaming(s.id)

                      return (
                        <div
                          key={s.id}
                          onClick={() => setActiveSessionId(s.id)}
                          className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-full text-xs font-light cursor-pointer t ${
                            isActive ? 'bg-elevated text-fg font-normal' : 'text-muted hover:text-fg hover:bg-elevated/40'
                          }`}
                        >
                          {generating ? (
                            <span className="relative flex w-2 h-2 shrink-0">
                              <span className="absolute inline-flex h-full w-full rounded-full bg-income opacity-75 animate-ping" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-income" />
                            </span>
                          ) : (
                            <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
                          )}

                          <div className="min-w-0 flex-1 pr-2">
                            {isEditing ? (
                              <form onSubmit={(e) => saveRename(s.id, e)} className="flex items-center gap-1 w-full">
                                <input
                                  type="text"
                                  value={editedTitle}
                                  onChange={(e) => setEditedTitle(e.target.value)}
                                  autoFocus
                                  className="w-full bg-bg rounded-full px-2.5 py-0.5 text-xs text-fg focus:outline-none"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <button type="submit" className="text-income hover:opacity-80 p-0.5 shrink-0">
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setEditingId(null) }}
                                  className="text-expense hover:opacity-80 p-0.5 shrink-0"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </form>
                            ) : (
                              <span className="truncate block">{s.title}</span>
                            )}
                          </div>

                          {!isEditing && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button
                                onClick={(e) => startRename(s, e)}
                                className="p-1 hover:text-fg text-muted/70 rounded-full transition-colors"
                                title="Rinomina chat"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => handleDelete(s.id, e)}
                                className="p-1 hover:text-expense text-muted/70 rounded-full transition-colors"
                                title="Elimina chat"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            <AnimatePresence>
              {deleteNotice && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="text-[10.5px] text-center text-expense bg-expense/10 rounded-full px-3 py-2"
                >
                  {deleteNotice}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
