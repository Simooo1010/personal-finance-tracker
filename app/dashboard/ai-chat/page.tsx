'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { SparkleIcon } from '@/components/SparkleIcon'
import { Markdown } from '@/components/Markdown'
import { useAi } from '@/components/AiContext'
import { useAiChat, type ChatMessage } from '@/components/ai-chat/AiChatContext'
import { useRouter } from 'next/navigation'
import { ChatSidebar } from '@/components/ai-chat/ChatSidebar'
import { Composer } from '@/components/ai-chat/Composer'

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

function parseMessageContent(content: string): { cleanText: string; exports: ExportBlock[] } {
  const exports: ExportBlock[] = []
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
  const cleanText = content.replace(/```json:export[\s\S]*?```/g, '').trim()
  return { cleanText, exports }
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

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[75%] bg-income/10 rounded-3xl px-4 py-2.5 text-xs sm:text-sm font-light leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </motion.div>
    )
  }

  const { cleanText, exports } = parseMessageContent(message.content)
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full">
      <div className="text-[10.5px] font-semibold tracking-wider uppercase text-income mb-1.5">Sparkle</div>
      <div className="text-xs sm:text-sm font-light leading-relaxed max-w-none">
        {cleanText && <Markdown>{cleanText}</Markdown>}
        {exports.map((exp, idx) => <FileCard key={idx} exp={exp} />)}
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
  const bottomRef = useRef<HTMLDivElement>(null)

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

  return (
    <div className="flex h-[calc(100vh-100px)] w-full overflow-hidden bg-bg rounded-3xl 2xl:max-w-5xl 2xl:mx-auto">
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
                {messages.map((m) => <MessageRow key={m.id} message={m} />)}
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
