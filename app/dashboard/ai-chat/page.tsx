'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, PanelLeftClose, PanelLeftOpen, Check, X, Loader2 } from 'lucide-react'
import { SparkleIcon } from '@/components/SparkleIcon'
import { Markdown } from '@/components/Markdown'
import { useAi } from '@/components/AiContext'
import { useAiChat, type ChatMessage, type TransactionActionProposal } from '@/components/ai-chat/AiChatContext'
import { useRouter } from 'next/navigation'
import { ChatSidebar } from '@/components/ai-chat/ChatSidebar'
import { Composer } from '@/components/ai-chat/Composer'
import { useTransactions } from '@/components/TransactionsContext'
import { parseSignedTransactionProposal } from '@/lib/aiActionSchema'

const SUGGESTIONS = [
  'Quanto ho speso questa settimana?',
  'Dammi 3 consigli per risparmiare',
  'Ho abbastanza per un acquisto da 50€?',
]

type ExportBlock = {
  type: 'csv' | 'xlsx' | 'txt' | 'html'
  filename: string
  headers: string[]
  rows: any[]
}

function parseMessageContent(content: string): { cleanText: string; exports: ExportBlock[]; actions: TransactionActionProposal[] } {
  const exports: ExportBlock[] = []
  const actions: TransactionActionProposal[] = []
  const exportRegex = /```json:export\s*([\s\S]*?)\s*```/g
  let match
  while ((match = exportRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      if (parsed && typeof parsed === 'object') {
        parsed.rows = Array.isArray(parsed.rows) ? parsed.rows : []
        parsed.headers = Array.isArray(parsed.headers) ? parsed.headers : []
        exports.push(parsed)
      }
    } catch {
      // Truncated or malformed export block (e.g. cut off by the token
      // limit) — skip it rather than rendering a broken card.
    }
  }
  const actionRegex = /```json:action\s*([\s\S]*?)\s*```/g
  while ((match = actionRegex.exec(content)) !== null) {
    try {
      const parsed = parseSignedTransactionProposal(JSON.parse(match[1]))
      if (parsed) actions.push(parsed)
    } catch {
      // Ignore malformed proposal blocks; they never render as an action.
    }
  }
  const cleanText = content.replace(/```json:export[\s\S]*?```/g, '').replace(/```json:action[\s\S]*?```/g, '').trim()
  return { cleanText, exports, actions }
}

function triggerDownload(exp: ExportBlock) {
  const { type, filename, headers, rows } = exp
  let content = ''
  let mimeType = 'text/plain'

  if (type === 'csv' || type === 'xlsx') {
    content = '﻿'
    if (headers.length > 0) content += headers.join(';') + '\n'
    content += rows.map((r) => Array.isArray(r) ? r.join(';') : r).join('\n')
    mimeType = 'text/csv;charset=utf-8;'
  } else if (type === 'txt') {
    content = rows.map((r) => Array.isArray(r) ? r.join(' ') : r).join('\n')
    mimeType = 'text/plain;charset=utf-8;'
  } else if (type === 'html') {
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(`
        <html><head><title>${filename}</title><style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; padding: 40px; line-height: 1.6; }
          .header { border-bottom: 2px solid #eaeaea; padding-bottom: 20px; margin-bottom: 30px; }
          h1 { font-size: 24px; font-weight: 300; margin: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; font-size: 14px; }
          th { background-color: #fafafa; font-weight: 600; }
          @media print { body { padding: 0; } button { display: none; } }
        </style></head><body>
          <div class="header"><h1>Report Finanziario Personale</h1>
          <p style="font-size:12px;color:#666;margin:5px 0 0 0;">Generato il ${new Date().toLocaleDateString('it-IT')}</p></div>
          <button onclick="window.print()" style="margin-bottom:20px;padding:10px 20px;background:#000;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">Stampa / Salva in PDF</button>
          ${rows.join('\n')}
          <div style="margin-top:50px;font-size:12px;color:#888;text-align:center;">Personal Finance Tracker • Sparkle</div>
          <script>setTimeout(() => { window.print(); }, 500);</script>
        </body></html>
      `)
      win.document.close()
      return
    }
  }

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename || 'report.txt'
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function FileCard({ exp }: { exp: ExportBlock }) {
  const badge = exp.type === 'csv' || exp.type === 'xlsx' ? 'XL' : exp.type === 'html' ? 'PDF' : 'TXT'
  const badgeColor = exp.type === 'csv' || exp.type === 'xlsx' ? 'text-income' : exp.type === 'html' ? 'text-expense' : 'text-muted'
  return (
    <div className="flex items-center justify-between gap-3 p-3 bg-elevated rounded-2xl mt-2">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-full bg-fg/10 flex items-center justify-center shrink-0">
          <span className={`font-semibold text-[10px] ${badgeColor}`}>{badge}</span>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium truncate max-w-[160px] sm:max-w-[320px]">{exp.filename}</p>
          <p className="text-[9px] text-muted tracking-wider uppercase font-light">
            {exp.type === 'html' ? 'Documento PDF' : 'Tabella Dati'}
          </p>
        </div>
      </div>
      <button
        onClick={() => triggerDownload(exp)}
        className="px-3 py-1.5 bg-fg text-bg rounded-full text-[10px] font-semibold hover:opacity-90 t cursor-pointer shrink-0"
      >
        Scarica
      </button>
    </div>
  )
}

function MessageRow({ message, actionStatus, onConfirm, onDismiss }: {
  message: ChatMessage
  actionStatus: Record<string, { state: 'saving' | 'saved' | 'dismissed' | 'error'; message?: string }>
  onConfirm: (proposal: TransactionActionProposal) => void
  onDismiss: (requestId: string) => void
}) {
  if (message.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[75%] bg-income/10 rounded-3xl px-4 py-2.5 text-xs sm:text-sm font-light leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </motion.div>
    )
  }

  const { cleanText, exports, actions } = parseMessageContent(message.content)
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full">
      <div className="text-[10.5px] font-semibold tracking-wider uppercase text-income mb-1.5">Sparkle</div>
      <div className="text-xs sm:text-sm font-light leading-relaxed max-w-none">
        {cleanText && <Markdown>{cleanText}</Markdown>}
        {exports.map((exp, idx) => <FileCard key={idx} exp={exp} />)}
        {actions.map(action => {
          const status = actionStatus[action.requestId]
          const amount = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(action.amount)
          const date = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${action.date}T12:00:00Z`))
          return (
            <div key={action.requestId} className="mt-3 rounded-2xl border border-income/20 bg-income/5 p-4">
              <div className="text-[10px] uppercase tracking-wider text-income font-semibold">Proposta di registrazione · da verificare</div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-xs">
                <div><dt className="text-muted">Descrizione</dt><dd className="font-medium break-words">{action.description}</dd></div>
                <div><dt className="text-muted">Importo</dt><dd className="font-medium">{amount} · {action.direction === 'income' ? 'Entrata' : 'Uscita'}</dd></div>
                <div><dt className="text-muted">Data</dt><dd>{date}</dd></div>
                <div><dt className="text-muted">Portafoglio</dt><dd className="break-words">{action.wallet}</dd></div>
              </dl>
              {status?.state === 'saved' ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-income"><Check className="w-3.5 h-3.5" /> Transazione registrata</p>
              ) : status?.state === 'dismissed' ? (
                <p className="mt-3 text-xs text-muted">Proposta ignorata</p>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button onClick={() => onConfirm(action)} disabled={status?.state === 'saving'} className="inline-flex items-center gap-1.5 rounded-full bg-income px-3 py-2 text-[11px] font-semibold text-bg disabled:opacity-60">
                    {status?.state === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Conferma e registra
                  </button>
                  <button onClick={() => onDismiss(action.requestId)} disabled={status?.state === 'saving'} className="inline-flex items-center gap-1.5 rounded-full bg-elevated px-3 py-2 text-[11px] text-muted disabled:opacity-60">
                    <X className="w-3.5 h-3.5" /> Ignora
                  </button>
                  {status?.state === 'error' && <p role="alert" className="w-full text-xs text-expense">{status.message}</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

function StreamingRow({ text }: { text: string }) {
  // Live-render only text that's already known to be safe (the server-side
  // filter withholds json:memory/json:export fences from ever streaming in),
  // so this never needs to guess at unfinished markdown/JSON mid-token.
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full">
      <div className="text-[10.5px] font-semibold tracking-wider uppercase text-income mb-1.5">Sparkle</div>
      <div className="text-xs sm:text-sm font-light leading-relaxed">
        {text ? (
          <span>
            <Markdown>{text}</Markdown>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-income animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-income animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-income animate-bounce" />
          </span>
        )}
      </div>
    </motion.div>
  )
}

export default function AiChatPage() {
  const { isAiEnabled } = useAi()
  const router = useRouter()
  const {
    activeSessionId, sessions, getMessages, getStream, isStreaming,
    getError, clearError, sendMessage, stopStreaming, deleteSession, renameSession,
  } = useAiChat()

  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [actionStatus, setActionStatus] = useState<Record<string, { state: 'saving' | 'saved' | 'dismissed' | 'error'; message?: string }>>({})
  const bottomRef = useRef<HTMLDivElement>(null)
  const { refetch: refetchTransactions } = useTransactions()

  useEffect(() => {
    if (isAiEnabled === false) router.push('/dashboard')
  }, [isAiEnabled, router])

  const messages = getMessages(activeSessionId)
  const stream = getStream(activeSessionId)
  const streaming = isStreaming(activeSessionId)
  const error = getError(activeSessionId)
  const activeSession = sessions.find(s => s.id === activeSessionId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, stream?.text])

  if (isAiEnabled === false) return null

  const showEmpty = messages.length === 0 && !stream && !error

  const handleDeleteCurrent = async () => {
    if (!activeSessionId) return
    if (!confirm('Sei sicuro di voler eliminare questa conversazione?')) return
    const result = await deleteSession(activeSessionId)
    if (!result.ok && result.reason) alert(result.reason)
  }

  const confirmAction = async (proposal: TransactionActionProposal) => {
    if (actionStatus[proposal.requestId]?.state === 'saving' || actionStatus[proposal.requestId]?.state === 'saved') return
    setActionStatus(prev => ({ ...prev, [proposal.requestId]: { state: 'saving' } }))
    try {
      const response = await fetch('/api/ai/actions/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: proposal.confirmationToken,
          proposal: {
            type: proposal.type,
            date: proposal.date,
            wallet: proposal.wallet,
            direction: proposal.direction,
            description: proposal.description,
            amount: proposal.amount,
          },
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Salvataggio non riuscito. Riprova.')
      setActionStatus(prev => ({ ...prev, [proposal.requestId]: { state: 'saved' } }))
      await refetchTransactions()
    } catch (error) {
      setActionStatus(prev => ({
        ...prev,
        [proposal.requestId]: { state: 'error', message: error instanceof Error ? error.message : 'Errore durante il salvataggio.' },
      }))
    }
  }

  return (
    <div className="relative flex h-[calc(100vh-100px)] w-full overflow-hidden bg-bg rounded-3xl 2xl:max-w-5xl 2xl:mx-auto">
      {/* Mobile backdrop — tap outside sidebar to close it */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-10 bg-black/40 sm:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <ChatSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(prev => !prev)}
              className="p-2 hover:bg-elevated/60 text-muted hover:text-fg rounded-full t cursor-pointer shrink-0"
              title={isSidebarOpen ? 'Nascondi barra laterale' : 'Mostra barra laterale'}
            >
              {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>

            {editingTitle && activeSessionId ? (
              <form
                onSubmit={(e) => { e.preventDefault(); renameSession(activeSessionId, titleDraft); setEditingTitle(false) }}
                className="min-w-0"
              >
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => setEditingTitle(false)}
                  className="bg-elevated rounded-full px-3 py-1 text-sm font-medium focus:outline-none min-w-0"
                />
              </form>
            ) : (
              <h1
                className="text-sm font-medium tracking-tight truncate cursor-text px-1"
                onClick={() => {
                  if (!activeSession) return
                  setTitleDraft(activeSession.title)
                  setEditingTitle(true)
                }}
              >
                {activeSession ? activeSession.title : 'Nuova Chat'}
              </h1>
            )}
          </div>

          {activeSessionId && (
            <button
              onClick={handleDeleteCurrent}
              className="p-2 hover:bg-elevated/60 text-muted hover:text-expense rounded-full t cursor-pointer shrink-0"
              title="Elimina Chat Corrente"
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* Thread */}
        <div className="flex-1 overflow-y-auto scrollbar-none">
          {showEmpty ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 px-6 max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fg to-income flex items-center justify-center">
                <SparkleIcon className="w-6 h-6 text-bg" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight mb-1.5">Ciao, sono Sparkle</h2>
                <p className="text-xs sm:text-sm font-light text-muted">
                  Chiedimi del tuo budget, delle spese recenti o di un consiglio per risparmiare.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-1">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="px-4 py-2 bg-elevated hover:bg-elevated/70 rounded-full text-xs font-light t cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-7">
              <AnimatePresence initial={false}>
                {messages.map((m) => <MessageRow key={m.id} message={m} actionStatus={actionStatus} onConfirm={confirmAction} onDismiss={(id) => setActionStatus(prev => ({ ...prev, [id]: { state: 'dismissed' } }))} />)}
                {stream && <StreamingRow key="__stream__" text={stream.text} />}
                {error && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center">
                    <button
                      onClick={() => clearError(activeSessionId)}
                      className="text-[10px] text-expense tracking-wide uppercase px-3 py-1.5 bg-expense/10 rounded-full hover:bg-expense/15 t cursor-pointer"
                      title="Chiudi"
                    >
                      Errore: {error} ✕
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <Composer
          streaming={streaming}
          onSend={(text) => sendMessage(text)}
          onStop={() => stopStreaming(activeSessionId)}
        />
      </div>
    </div>
  )
}
