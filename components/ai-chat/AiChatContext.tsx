'use client'

import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabaseClient'

export type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
}

export type ChatSession = {
  id: string
  title: string
  created_at: string
  updated_at: string
}

type StreamState = {
  text: string
}

type NdjsonEvent =
  | { type: 'session'; sessionId: string; sessionTitle: string }
  | { type: 'delta'; text: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'done'; exportBlocks: string[] }

const PENDING_KEY = '__pending__'

interface AiChatContextType {
  sessions: ChatSession[]
  loadingSessions: boolean
  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void
  getMessages: (sessionId: string | null) => ChatMessage[]
  isLoadingMessages: (sessionId: string) => boolean
  getStream: (sessionId: string | null) => StreamState | null
  isStreaming: (sessionId: string | null) => boolean
  getError: (sessionId: string | null) => string | null
  clearError: (sessionId: string | null) => void
  sendMessage: (text: string) => Promise<void>
  stopStreaming: (sessionId: string | null) => void
  startNewChat: () => void
  renameSession: (sessionId: string, title: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<{ ok: boolean; reason?: string }>
}

const AiChatContext = createContext<AiChatContextType | null>(null)

export function AiChatProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()

  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null)

  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({})
  const [loadingMessageSets, setLoadingMessageSets] = useState<Set<string>>(new Set())
  const [streams, setStreams] = useState<Record<string, StreamState>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const abortControllers = useRef<Record<string, AbortController>>({})
  const fetchedSessionIds = useRef<Set<string>>(new Set())

  // ── Load sessions once, with the one-time legacy-data migration ──
  const loadSessions = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    let currentSessions = data || []

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
              title,
              created_at: orphanMsgs[0].created_at || new Date().toISOString(),
              updated_at: orphanMsgs[orphanMsgs.length - 1].created_at || new Date().toISOString(),
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
      console.error('Auto-migration check skipped or errored:', e)
    }

    setSessions(currentSessions)
    setLoadingSessions(false)
  }, [supabase])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // ── Lazily load + cache messages for a session ──
  const ensureMessagesLoaded = useCallback(async (sessionId: string) => {
    if (fetchedSessionIds.current.has(sessionId)) return
    fetchedSessionIds.current.add(sessionId)

    setLoadingMessageSets(prev => new Set(prev).add(sessionId))

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', user.id)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    setMessagesBySession(prev => ({
      ...prev,
      [sessionId]: !error && data ? data.map(m => ({ id: m.id, role: m.role, content: m.content })) : [],
    }))
    setLoadingMessageSets(prev => {
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
  }, [supabase])

  const setActiveSessionId = useCallback((id: string | null) => {
    setActiveSessionIdState(id)
    if (id) ensureMessagesLoaded(id)
  }, [ensureMessagesLoaded])

  // A brand-new chat has no session id yet until the server resolves one, so
  // its optimistic message + in-flight stream live under PENDING_KEY in the
  // meantime — these getters fall back to it whenever the caller passes null,
  // so the "new chat" view doesn't flash empty while that round-trip is in flight.
  const getMessages = useCallback((sessionId: string | null) => {
    return messagesBySession[sessionId ?? PENDING_KEY] || []
  }, [messagesBySession])

  const isLoadingMessages = useCallback((sessionId: string) => loadingMessageSets.has(sessionId), [loadingMessageSets])

  const getStream = useCallback((sessionId: string | null) => {
    return streams[sessionId ?? PENDING_KEY] || null
  }, [streams])

  const isStreaming = useCallback((sessionId: string | null) => {
    return (sessionId ?? PENDING_KEY) in streams
  }, [streams])

  const getError = useCallback((sessionId: string | null) => {
    return errors[sessionId ?? PENDING_KEY] || null
  }, [errors])

  const clearError = useCallback((sessionId: string | null) => {
    const key = sessionId ?? PENDING_KEY
    setErrors(prev => {
      const { [key]: _, ...rest } = prev
      return rest
    })
  }, [])

  const startNewChat = useCallback(() => {
    setActiveSessionIdState(null)
  }, [])

  const finalizeStream = useCallback(async (sessionId: string, finalText: string, userText: string) => {
    setMessagesBySession(prev => ({
      ...prev,
      [sessionId]: [
        ...(prev[sessionId] || []),
        { id: `local-assistant-${Date.now()}`, role: 'assistant', content: finalText },
      ],
    }))
    setStreams(prev => {
      const next = { ...prev }
      delete next[sessionId]
      return next
    })
    delete abortControllers.current[sessionId]

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('chat_messages').insert([
      { user_id: user.id, session_id: sessionId, role: 'user', content: userText },
      { user_id: user.id, session_id: sessionId, role: 'assistant', content: finalText },
    ])
    loadSessions()
  }, [supabase, loadSessions])

  /**
   * Ends a generation that failed. Always clears the `streams` entry first —
   * `isStreaming` is derived from that map, so leaving a failed entry behind
   * would permanently stick the composer in "generating" mode. Any partial
   * text is still saved as a real message when there's a session to save it to.
   */
  const settleWithError = useCallback(async (
    resolvedSessionId: string | null,
    draftKey: string,
    accumulatedText: string,
    userText: string,
    message: string,
  ) => {
    const key = resolvedSessionId ?? draftKey
    setStreams(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setErrors(prev => ({ ...prev, [key]: message }))
    if (resolvedSessionId && accumulatedText) {
      await finalizeStream(resolvedSessionId, accumulatedText, userText)
    }
  }, [finalizeStream])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const targetSessionId = activeSessionId
    const draftKey = targetSessionId ?? PENDING_KEY
    const userMsg: ChatMessage = { id: `local-user-${Date.now()}`, role: 'user', content: trimmed }

    const historyForRequest = [...(targetSessionId ? getMessages(targetSessionId) : []), userMsg]
      .map(m => ({ role: m.role, content: m.content }))

    setMessagesBySession(prev => ({
      ...prev,
      [draftKey]: [...(prev[draftKey] || []), userMsg],
    }))
    setStreams(prev => ({ ...prev, [draftKey]: { text: '' } }))
    clearError(targetSessionId)

    const controller = new AbortController()
    abortControllers.current[draftKey] = controller

    let resolvedSessionId = targetSessionId
    // Tracked locally (not read from React state) because this callback is
    // intentionally not re-created on every delta — see the comment below.
    let accumulatedText = ''

    const migrateDraftIfNeeded = (realId: string) => {
      if (resolvedSessionId === realId) return
      resolvedSessionId = realId
      if (draftKey === realId) return

      setMessagesBySession(prev => {
        const { [draftKey]: draftMsgs, ...rest } = prev
        return { ...rest, [realId]: [...(rest[realId] || []), ...(draftMsgs || [])] }
      })
      setStreams(prev => {
        const { [draftKey]: draftStream, ...rest } = prev
        return draftStream ? { ...rest, [realId]: draftStream } : rest
      })
      delete abortControllers.current[draftKey]
      abortControllers.current[realId] = controller

      // Follow the conversation into its real id only if the user hasn't
      // since navigated elsewhere — that's what makes this "background safe".
      setActiveSessionIdState(prev => (prev === targetSessionId ? realId : prev))
    }

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: targetSessionId, messages: historyForRequest }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || data.error || 'Errore nella richiesta')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let exportBlocks: string[] = []
      let sawError: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          let event: NdjsonEvent
          try {
            event = JSON.parse(line)
          } catch {
            continue
          }

          if (event.type === 'session') {
            migrateDraftIfNeeded(event.sessionId)
            setSessions(prev => {
              if (prev.some(s => s.id === event.sessionId)) {
                return prev.map(s => s.id === event.sessionId ? { ...s, title: event.sessionTitle } : s)
              }
              const now = new Date().toISOString()
              return [{ id: event.sessionId, title: event.sessionTitle, created_at: now, updated_at: now }, ...prev]
            })
            fetchedSessionIds.current.add(event.sessionId)
          } else if (event.type === 'delta') {
            const key = resolvedSessionId ?? draftKey
            accumulatedText += event.text
            setStreams(prev => ({ ...prev, [key]: { text: (prev[key]?.text || '') + event.text } }))
          } else if (event.type === 'error') {
            sawError = event.message
          } else if (event.type === 'done') {
            exportBlocks = event.exportBlocks
          }
        }
      }

      if (sawError) {
        await settleWithError(resolvedSessionId, draftKey, accumulatedText, trimmed, sawError)
        return
      }

      const finalText = accumulatedText + (exportBlocks.length ? '\n\n' + exportBlocks.join('\n\n') : '')
      if (resolvedSessionId) {
        await finalizeStream(resolvedSessionId, finalText, trimmed)
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // User stopped generation deliberately — keep whatever text streamed in so far.
        if (resolvedSessionId && accumulatedText) {
          await finalizeStream(resolvedSessionId, accumulatedText, trimmed)
        } else {
          const key = resolvedSessionId ?? draftKey
          setStreams(prev => {
            const next = { ...prev }
            delete next[key]
            return next
          })
        }
        return
      }
      await settleWithError(resolvedSessionId, draftKey, accumulatedText, trimmed, err.message || 'Errore di rete')
    }
    // Intentionally not depending on `streams` — accumulation is tracked in
    // the local `accumulatedText` variable above so this closure doesn't
    // need to be recreated (and thus re-subscribed) on every streamed token.
  }, [activeSessionId, getMessages, finalizeStream, settleWithError, clearError])

  const stopStreaming = useCallback((sessionId: string | null) => {
    const key = sessionId ?? PENDING_KEY
    abortControllers.current[key]?.abort()
  }, [])

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    const { error } = await supabase.from('chat_sessions').update({ title: trimmed }).eq('id', sessionId)
    if (!error) {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: trimmed } : s))
    }
  }, [supabase])

  const deleteSession = useCallback(async (sessionId: string) => {
    if (sessionId in streams) {
      return { ok: false, reason: 'Non puoi eliminare una chat mentre Sparkle sta ancora rispondendo.' }
    }
    const { error } = await supabase.from('chat_sessions').delete().eq('id', sessionId)
    if (error) return { ok: false, reason: 'Eliminazione non riuscita. Riprova.' }

    setSessions(prev => prev.filter(s => s.id !== sessionId))
    setMessagesBySession(prev => {
      const { [sessionId]: _, ...rest } = prev
      return rest
    })
    fetchedSessionIds.current.delete(sessionId)

    setActiveSessionIdState(prev => {
      if (prev !== sessionId) return prev
      const remaining = sessions.filter(s => s.id !== sessionId)
      return remaining.length > 0 ? remaining[0].id : null
    })

    return { ok: true }
  }, [supabase, sessions, streams])

  return (
    <AiChatContext.Provider
      value={{
        sessions,
        loadingSessions,
        activeSessionId,
        setActiveSessionId,
        getMessages,
        isLoadingMessages,
        getStream,
        isStreaming,
        getError,
        clearError,
        sendMessage,
        stopStreaming,
        startNewChat,
        renameSession,
        deleteSession,
      }}
    >
      {children}
    </AiChatContext.Provider>
  )
}

export function useAiChat() {
  const ctx = useContext(AiChatContext)
  if (!ctx) throw new Error('useAiChat must be used within an AiChatProvider')
  return ctx
}
