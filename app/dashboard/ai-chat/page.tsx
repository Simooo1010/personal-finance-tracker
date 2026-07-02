'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, User, Loader2 } from 'lucide-react'
import { SparkleIcon } from '@/components/SparkleIcon'
import { useAi } from '@/components/AiContext'
import { useRouter } from 'next/navigation'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export default function AiChatPage() {
  const { isAiEnabled } = useAi()
  const router = useRouter()
  
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const bottomRef = useRef<HTMLDivElement>(null)

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
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/\n\n/g, '<br/><br/>')
    html = html.replace(/\n/g, '<br/>')
    return html
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError(null)

    try {
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

      const botMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: data.reply }
      setMessages(prev => [...prev, botMsg])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (isAiEnabled === false) return null

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="flex items-center gap-3 py-4 border-b border-border/10 shrink-0">
        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-elevated/50 text-fg">
          <SparkleIcon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-light tracking-tight text-fg">Assistente AI</h1>
          <p className="text-[10px] tracking-wider text-muted uppercase">Consulente Finanziario</p>
        </div>
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
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: formatMarkdown(m.content) }} />
                )}
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
