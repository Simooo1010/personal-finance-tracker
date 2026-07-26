'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Send, 
  User, 
  Loader2, 
  Trash2, 
  Plus, 
  MessageSquare, 
  PanelLeftClose, 
  PanelLeftOpen, 
  Edit3, 
  Check, 
  X 
} from 'lucide-react'
import { SparkleIcon } from '@/components/SparkleIcon'
import { useAi } from '@/components/AiContext'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type ChatSession = {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export default function AiChatPage() {
  const { isAiEnabled } = useAi()
  const router = useRouter()
  const supabase = createClient()
  
  // Chat Sessions & Sidebar State
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editedTitle, setEditedTitle] = useState('')

  // Active Chat State
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const bottomRef = useRef<HTMLDivElement>(null)

  // Redirect if AI is disabled
  useEffect(() => {
    if (isAiEnabled === false) {
      router.push('/dashboard')
    }
  }, [isAiEnabled, router])

  // Fetch user chat sessions & auto-migrate orphan messages from before session_id was added
  const loadSessions = async (selectFirst = true) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 1. Fetch sessions
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    let currentSessions = data || []

    // 2. Auto-migrate existing messages with session_id = NULL if no sessions or orphan messages exist
    try {
      const { data: orphanMsgs } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', user.id)
        .is('session_id', null)
        .order('created_at', { ascending: true })

      if (orphanMsgs && orphanMsgs.length > 0) {
        let targetSessionId = currentSessions.length > 0 ? currentSessions[0].id : null

        if (!targetSessionId) {
          const firstUserMsg = orphanMsgs.find(m => m.role === 'user')?.content || 'Conversazione precedente'
          const title = firstUserMsg.length > 35 ? `${firstUserMsg.slice(0, 35)}...` : firstUserMsg

          const { data: newSession } = await supabase
            .from('chat_sessions')
            .insert({
              user_id: user.id,
              title: title,
              created_at: orphanMsgs[0].created_at || new Date().toISOString(),
              updated_at: orphanMsgs[orphanMsgs.length - 1].created_at || new Date().toISOString()
            })
            .select()
            .single()

          if (newSession) {
            targetSessionId = newSession.id
            currentSessions = [newSession, ...currentSessions]
          }
        }

        if (targetSessionId) {
          await supabase
            .from('chat_messages')
            .update({ session_id: targetSessionId })
            .eq('user_id', user.id)
            .is('session_id', null)
        }
      }
    } catch (e) {
      console.error("Auto-migration check skipped or errored:", e)
    }

    setSessions(currentSessions)
    if (selectFirst && currentSessions.length > 0 && !activeSessionId) {
      setActiveSessionId(currentSessions[0].id)
    }
    setLoadingSessions(false)
  }

  useEffect(() => {
    if (isAiEnabled !== false) {
      loadSessions(true)
    }
  }, [isAiEnabled])

  // Fetch messages for active session
  useEffect(() => {
    async function loadSessionMessages() {
      if (!activeSessionId) {
        setMessages([])
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch messages belonging to activeSessionId
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', user.id)
        .eq('session_id', activeSessionId)
        .order('created_at', { ascending: true })

      if (!error && data && data.length > 0) {
        setMessages(data.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content
        })))
      } else {
        // Fallback: Check if there are legacy messages where session_id IS NULL
        const { data: legacyMsgs } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('user_id', user.id)
          .is('session_id', null)
          .order('created_at', { ascending: true })

        if (legacyMsgs && legacyMsgs.length > 0) {
          await supabase
            .from('chat_messages')
            .update({ session_id: activeSessionId })
            .eq('user_id', user.id)
            .is('session_id', null)

          setMessages(legacyMsgs.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content
          })))
        } else {
          setMessages([])
        }
      }
    }

    if (isAiEnabled !== false) {
      loadSessionMessages()
    }
  }, [activeSessionId, isAiEnabled])

  // Auto scroll to bottom of chat
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // New Chat Action
  const handleNewChat = () => {
    setActiveSessionId(null)
    setMessages([])
    setError(null)
    setInput('')
  }

  // Delete Session
  const handleDeleteSession = async (sessionIdToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm("Sei sicuro di voler eliminare questa conversazione?")) return

    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', sessionIdToDelete)

    if (!error) {
      setSessions(prev => prev.filter(s => s.id !== sessionIdToDelete))
      if (activeSessionId === sessionIdToDelete) {
        const remaining = sessions.filter(s => s.id !== sessionIdToDelete)
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].id)
        } else {
          handleNewChat()
        }
      }
    }
  }

  // Rename Session
  const handleStartRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSessionId(session.id)
    setEditedTitle(session.title)
  }

  const handleSaveTitle = async (sessionId: string, e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!editedTitle.trim()) return

    const { error } = await supabase
      .from('chat_sessions')
      .update({ title: editedTitle.trim() })
      .eq('id', sessionId)

    if (!error) {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: editedTitle.trim() } : s))
      setEditingSessionId(null)
    }
  }

  const formatMarkdown = (text: string) => {
    if (!text) return ''
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/\n\n/g, '<br/><br/>')
    html = html.replace(/\n/g, '<br/>')
    return html
  }

  const parseMessageContent = (content: string) => {
    const exports: any[] = []
    let cleanText = content
    
    // Match ```json:export ... ```
    const exportRegex = /```json:export\s*([\s\S]*?)\s*```/g
    let match
    while ((match = exportRegex.exec(content)) !== null) {
      const jsonStr = match[1]
      try {
        const parsed = JSON.parse(jsonStr)
        if (parsed && typeof parsed === 'object') {
          parsed.rows = Array.isArray(parsed.rows) ? parsed.rows : []
          parsed.headers = Array.isArray(parsed.headers) ? parsed.headers : []
          exports.push(parsed)
        }
      } catch (e) {
        console.error("Failed strict JSON parse, trying loose parsing:", e)
        try {
          const typeMatch = /"type"\s*:\s*"([^"]+)"/.exec(jsonStr)
          const filenameMatch = /"filename"\s*:\s*"([^"]+)"/.exec(jsonStr)
          
          if (typeMatch && filenameMatch) {
            const type = typeMatch[1]
            const filename = filenameMatch[1]
            let rows: any[] = []
            let headers: string[] = []
            
            const rowsMatch = /"rows"\s*:\s*\[([\s\S]*?)\]\s*(?:,|\})/.exec(jsonStr)
            if (rowsMatch) {
              const rowsContent = rowsMatch[1].trim()
              if (type === 'csv' || type === 'xlsx') {
                const subArrayRegex = /\[([\s\S]*?)\]/g
                let subMatch
                while ((subMatch = subArrayRegex.exec(rowsContent)) !== null) {
                  const items = subMatch[1].split(',').map(item => {
                    return item.trim().replace(/^["']|["']$/g, '').replace(/\\"/g, '"')
                  })
                  rows.push(items)
                }
              } else {
                const stringRegex = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g
                let strMatch
                while ((strMatch = stringRegex.exec(rowsContent)) !== null) {
                  const val = strMatch[0].slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n')
                  rows.push(val)
                }
              }
            }
            
            const headersMatch = /"headers"\s*:\s*\[([\s\S]*?)\]/.exec(jsonStr)
            if (headersMatch) {
              const headersContent = headersMatch[1].trim()
              const stringRegex = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g
              let strMatch
              while ((strMatch = stringRegex.exec(headersContent)) !== null) {
                headers.push(strMatch[0].slice(1, -1).replace(/\\"/g, '"'))
              }
            }
            
            exports.push({ type, filename, headers, rows })
          }
        } catch (looseErr) {
          console.error("Loose parsing failed as well:", looseErr)
        }
      }
    }
    
    cleanText = cleanText.replace(/```json:export[\s\S]*?```/g, '').trim()
    return { cleanText, exports }
  }

  const triggerDownload = (exp: any) => {
    if (!exp) return
    const { type, filename, headers, rows } = exp
    let content = ''
    let mimeType = 'text/plain'
    
    const safeHeaders = Array.isArray(headers) ? headers : []
    const safeRows = Array.isArray(rows) ? rows : []
    
    if (type === 'csv' || type === 'xlsx') {
      content = '\uFEFF'
      if (safeHeaders.length > 0) {
        content += safeHeaders.join(';') + '\n'
      }
      content += safeRows.map((r: any) => Array.isArray(r) ? r.join(';') : r).join('\n')
      mimeType = 'text/csv;charset=utf-8;'
    } else if (type === 'txt') {
      content = safeRows.map((r: any) => Array.isArray(r) ? r.join(' ') : r).join('\n')
      mimeType = 'text/plain;charset=utf-8;'
    } else if (type === 'html') {
      const win = window.open('', '_blank')
      if (win) {
        win.document.write(`
          <html>
            <head>
              <title>${filename}</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; padding: 40px; line-height: 1.6; }
                .header { border-bottom: 2px solid #eaeaea; padding-bottom: 20px; margin-bottom: 30px; }
                h1 { font-size: 24px; font-weight: 300; margin: 0; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; font-size: 14px; }
                th { background-color: #fafafa; font-weight: 600; }
                .footer { margin-top: 50px; font-size: 12px; color: #888; text-align: center; }
                @media print {
                  body { padding: 0; }
                  button { display: none; }
                }
              </style>
            </head>
            <body>
              <div class="header">
                <h1>Report Finanziario Personale</h1>
                <p style="font-size: 12px; color: #666; margin: 5px 0 0 0;">Generato il ${new Date().toLocaleDateString('it-IT')}</p>
              </div>
              <button onclick="window.print()" style="margin-bottom: 20px; padding: 10px 20px; background: #000; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Stampa / Salva in PDF</button>
              ${safeRows.join('\n')}
              <div class="footer">
                Personal Finance Tracker • Assistente AI
              </div>
              <script>
                setTimeout(() => { window.print(); }, 500);
              </script>
            </body>
          </html>
        `)
        win.document.close()
        return
      }
    }
    
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", filename || 'report.txt')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userText = input.trim()
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userText }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Utente non autenticato")

      // Fetch AI response
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId: activeSessionId,
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })) 
        })
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.message || data.error || 'Errore nella richiesta')
      }

      // Update active session ID if new session was created
      const currentSessId = data.sessionId || activeSessionId
      if (currentSessId && currentSessId !== activeSessionId) {
        setActiveSessionId(currentSessId)
      }

      // Save user & bot messages to Supabase
      if (currentSessId) {
        await supabase.from('chat_messages').insert([
          { user_id: user.id, session_id: currentSessId, role: 'user', content: userText },
          { user_id: user.id, session_id: currentSessId, role: 'assistant', content: data.reply }
        ])
      }

      const botMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: data.reply }
      setMessages(prev => [...prev, botMsg])

      // Reload sessions list to refresh titles & order
      await loadSessions(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (isAiEnabled === false) return null

  const activeSessionObj = sessions.find(s => s.id === activeSessionId)

  return (
    <div className="flex h-[calc(100vh-140px)] w-full overflow-hidden bg-bg rounded-2xl border border-border/10">
      
      {/* ── COLLAPSIBLE CHAT SESSIONS SIDEBAR ── */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="h-full bg-surface border-r border-border/10 flex flex-col shrink-0 overflow-hidden z-20"
          >
            {/* Sidebar Header: New Chat */}
            <div className="p-3 border-b border-border/10 flex items-center justify-between">
              <button
                onClick={handleNewChat}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-elevated hover:bg-elevated/80 text-fg rounded-xl text-xs font-medium t cursor-pointer"
              >
                <Plus className="w-4 h-4 text-income" />
                <span>Nuova Chat</span>
              </button>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 text-muted hover:text-fg rounded-lg transition-colors ml-1 cursor-pointer sm:hidden"
                title="Nascondi barra laterale"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-none">
              {loadingSessions ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-4 h-4 animate-spin text-muted" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-8 px-4 text-xs text-muted/60 font-light">
                  Nessuna chat precedente. Inizia ora!
                </div>
              ) : (
                sessions.map((s) => {
                  const isActive = s.id === activeSessionId
                  const isEditing = editingSessionId === s.id

                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        setActiveSessionId(s.id)
                        setError(null)
                      }}
                      className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-light cursor-pointer t ${
                        isActive
                          ? 'bg-elevated text-fg font-normal'
                          : 'text-muted hover:text-fg hover:bg-elevated/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
                        {isEditing ? (
                          <form onSubmit={(e) => handleSaveTitle(s.id, e)} className="flex items-center gap-1 w-full">
                            <input
                              type="text"
                              value={editedTitle}
                              onChange={(e) => setEditedTitle(e.target.value)}
                              autoFocus
                              className="w-full bg-bg border border-border/30 rounded px-1.5 py-0.5 text-xs text-fg focus:outline-none"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button type="submit" className="text-income hover:opacity-80 p-0.5">
                              <Check className="w-3 h-3" />
                            </button>
                            <button 
                              type="button" 
                              onClick={(e) => { e.stopPropagation(); setEditingSessionId(null) }} 
                              className="text-expense hover:opacity-80 p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </form>
                        ) : (
                          <span className="truncate">{s.title}</span>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => handleStartRename(s, e)}
                            className="p-1 hover:text-fg text-muted/70 rounded transition-colors"
                            title="Rinomina chat"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteSession(s.id, e)}
                            className="p-1 hover:text-expense text-muted/70 rounded transition-colors"
                            title="Elimina chat"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MAIN CHAT WINDOW ── */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-bg">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(prev => !prev)}
              className="p-2 hover:bg-elevated/60 text-muted hover:text-fg rounded-xl transition-colors cursor-pointer"
              title={isSidebarOpen ? "Nascondi barra laterale" : "Mostra barra laterale"}
            >
              {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-elevated/50 text-fg shrink-0">
                <SparkleIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-medium tracking-tight text-fg truncate">
                  {activeSessionObj ? activeSessionObj.title : 'Nuova Chat'}
                </h1>
                <p className="text-[9px] tracking-wider text-muted uppercase">Assistente AI • Memoria Attiva</p>
              </div>
            </div>
          </div>
          
          {activeSessionId && (
            <button
              onClick={(e) => handleDeleteSession(activeSessionId, e)}
              className="p-2 hover:bg-elevated/60 text-muted hover:text-expense rounded-lg transition-colors cursor-pointer"
              title="Elimina Chat Corrente"
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scrollbar-none">
          <AnimatePresence>
            {messages.length === 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center text-center space-y-4 text-muted/60"
              >
                <SparkleIcon className="w-12 h-12 opacity-50" />
                <p className="text-xs sm:text-sm font-light max-w-[280px]">
                  Ciao! Sono il tuo assistente virtuale personalizzato. Ricordo tutte le nostre conversazioni passate e la tua situazione finanziaria!
                </p>
              </motion.div>
            )}

            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-start gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs ${
                  m.role === 'user' ? 'bg-fg text-bg' : 'bg-elevated/80 text-fg'
                }`}>
                  {m.role === 'user' ? <User className="w-3.5 h-3.5" /> : <SparkleIcon className="w-3.5 h-3.5" />}
                </div>
                
                <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-xs sm:text-sm font-light leading-relaxed ${
                  m.role === 'user' 
                    ? 'bg-fg text-bg rounded-tr-none' 
                    : 'bg-surface border border-border/10 rounded-tl-none text-fg prose prose-invert prose-p:my-1 prose-strong:text-fg'
                }`}>
                  {m.role === 'user' ? (
                    m.content
                  ) : (() => {
                    const { cleanText, exports } = parseMessageContent(m.content)
                    return (
                      <div className="space-y-4">
                        {cleanText && <div dangerouslySetInnerHTML={{ __html: formatMarkdown(cleanText) }} />}
                        {exports.map((exp, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-elevated/40 border border-border/10 rounded-xl mt-2 animate-in fade-in duration-300">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-fg/10 text-fg flex items-center justify-center shrink-0">
                                {exp.type === 'csv' || exp.type === 'xlsx' ? (
                                  <span className="font-semibold text-[10px] text-income">XL</span>
                                ) : exp.type === 'html' ? (
                                  <span className="font-semibold text-[10px] text-expense">PDF</span>
                                ) : (
                                  <span className="font-semibold text-[10px] text-muted">TXT</span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-fg truncate max-w-[130px] sm:max-w-[200px]">{exp.filename}</p>
                                <p className="text-[9px] text-muted tracking-wider uppercase font-light">{exp.type === 'html' ? 'Documento PDF' : 'Tabella Dati'}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => triggerDownload(exp)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-fg text-bg rounded-lg text-[10px] font-semibold hover:opacity-90 transition-opacity cursor-pointer shrink-0"
                            >
                              Scarica
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </motion.div>
            ))}

            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3"
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center bg-elevated/80 text-fg">
                  <SparkleIcon className="w-3.5 h-3.5" />
                </div>
                <div className="bg-surface border border-border/10 rounded-2xl rounded-tl-none p-3.5 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted" />
                  <span className="text-xs text-muted font-light">L'AI sta pensando...</span>
                </div>
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-center"
              >
                <span className="text-[10px] text-expense tracking-wide uppercase px-3 py-1 bg-expense/10 rounded-full">
                  Errore: {error}
                </span>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </AnimatePresence>
        </div>

        {/* Input Form */}
        <div className="p-3 sm:p-4 border-t border-border/10 shrink-0">
          <form onSubmit={handleSend} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              placeholder="Scrivi un messaggio all'assistente..."
              className="w-full bg-surface border border-border/20 rounded-full pl-5 pr-12 py-3 text-xs sm:text-sm font-light focus:outline-none focus:border-fg t disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="absolute right-1.5 w-9 h-9 flex items-center justify-center bg-fg text-bg rounded-full hover:opacity-90 t disabled:opacity-50 disabled:bg-elevated disabled:text-muted cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          </form>
        </div>

      </div>

    </div>
  )
}
