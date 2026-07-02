'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, User, Loader2, Trash2 } from 'lucide-react'
import { SparkleIcon } from '@/components/SparkleIcon'
import { useAi } from '@/components/AiContext'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export default function AiChatPage() {
  const { isAiEnabled } = useAi()
  const router = useRouter()
  const supabase = createClient()
  
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const bottomRef = useRef<HTMLDivElement>(null)

  // Fetch conversation history from Supabase
  useEffect(() => {
    async function loadChatHistory() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      
      if (!error && data) {
        setMessages(data.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content
        })))
      }
    }
    
    if (isAiEnabled !== false) {
      loadChatHistory()
    }
  }, [isAiEnabled, supabase])

  // Redirect if AI is disabled
  useEffect(() => {
    if (isAiEnabled === false) {
      router.push('/dashboard')
    }
  }, [isAiEnabled, router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
      try {
        const parsed = JSON.parse(match[1])
        exports.push(parsed)
      } catch (e) {
        console.error("Failed to parse export block:", e)
      }
    }
    
    cleanText = cleanText.replace(/```json:export[\s\S]*?```/g, '').trim()
    return { cleanText, exports }
  }

  const triggerDownload = (exp: any) => {
    const { type, filename, headers, rows } = exp
    let content = ''
    let mimeType = 'text/plain'
    
    if (type === 'csv' || type === 'xlsx') {
      content = '\uFEFF'
      if (headers && headers.length > 0) {
        content += headers.join(';') + '\n'
      }
      content += rows.map((r: any) => r.join(';')).join('\n')
      mimeType = 'text/csv;charset=utf-8;'
    } else if (type === 'txt') {
      content = rows.map((r: any) => Array.isArray(r) ? r.join(' ') : r).join('\n')
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
              ${rows.join('\n')}
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

      // 1. Save user message to Supabase
      const { error: insertUserError } = await supabase.from('chat_messages').insert({
        user_id: user.id,
        role: 'user',
        content: userText
      })
      if (insertUserError) {
        console.error("Failed to save user message:", insertUserError)
      }

      // 2. Fetch AI response
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })) 
        })
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.message || data.error || 'Errore nella richiesta')
      }

      // 3. Save assistant reply to Supabase
      const { error: insertBotError } = await supabase.from('chat_messages').insert({
        user_id: user.id,
        role: 'assistant',
        content: data.reply
      })
      if (insertBotError) {
        console.error("Failed to save bot reply:", insertBotError)
      }

      const botMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: data.reply }
      setMessages(prev => [...prev, botMsg])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleClearHistory = async () => {
    if (!confirm("Sei sicuro di voler cancellare tutta la cronologia della chat?")) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('chat_messages').delete().eq('user_id', user.id)
    if (!error) {
      setMessages([])
    }
  }

  if (isAiEnabled === false) return null

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="flex items-center justify-between py-4 border-b border-border/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-elevated/50 text-fg">
            <SparkleIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-light tracking-tight text-fg">Assistente AI</h1>
            <p className="text-[10px] tracking-wider text-muted uppercase">Consulente Finanziario</p>
          </div>
        </div>
        
        {messages.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="p-2 hover:bg-elevated/60 text-muted hover:text-expense rounded-lg transition-colors cursor-pointer"
            title="Cancella Cronologia Chat"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto py-6 space-y-6 scrollbar-none pr-2">
        <AnimatePresence>
          {messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center text-center space-y-4 text-muted/60"
            >
              <SparkleIcon className="w-12 h-12 opacity-50" />
              <p className="text-sm font-light max-w-[250px]">
                Ciao! Sono il tuo assistente virtuale. Chiedimi un consiglio sulle tue finanze o un riepilogo delle tue spese.
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
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                m.role === 'user' ? 'bg-fg text-bg' : 'bg-elevated/80 text-fg'
              }`}>
                {m.role === 'user' ? <User className="w-4 h-4" /> : <SparkleIcon className="w-4 h-4" />}
              </div>
              
              <div className={`max-w-[80%] rounded-2xl p-4 text-sm font-light leading-relaxed ${
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
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-elevated/80 text-fg">
                <SparkleIcon className="w-4 h-4" />
              </div>
              <div className="bg-surface border border-border/10 rounded-2xl rounded-tl-none p-4 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted" />
                <span className="text-xs text-muted font-light">Elaborazione...</span>
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

      {/* Input Area */}
      <div className="pt-4 pb-2 border-t border-border/10 shrink-0">
        <form onSubmit={handleSend} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Scrivi un messaggio..."
            className="w-full bg-surface border border-border/20 rounded-full pl-6 pr-14 py-4 text-sm font-light focus:outline-none focus:border-fg t disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-2 w-10 h-10 flex items-center justify-center bg-fg text-bg rounded-full hover:opacity-90 t disabled:opacity-50 disabled:bg-elevated disabled:text-muted"
          >
            <Send className="w-4 h-4" strokeWidth={2} />
          </button>
        </form>
      </div>
    </div>
  )
}
