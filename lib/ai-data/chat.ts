import type { ReadOnlyDb } from './readonly'

/** Read-only access to the user's AI chat history (chat_sessions / chat_messages). */

function clampInt(value: number | undefined, def: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.floor(value as number) : def
  return Math.min(max, Math.max(min, n))
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, c => `\\${c}`)
}

type SessionRow = { id: string; title: string; created_at: string; updated_at: string }
type MessageRow = { id: string; session_id: string; role: string; content: string; created_at: string }

export interface ChatSessionSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

export interface ChatMessageItem {
  id: string
  role: string
  content: string
  createdAt: string
}

export interface ChatSearchHit {
  id: string
  sessionId: string | null
  sessionTitle: string | null
  role: string
  createdAt: string
  snippet: string
}

export const MESSAGES_DEFAULT_LIMIT = 50
export const MESSAGES_MAX_LIMIT = 100

// Per-session message counts run as head-only count queries, a few at a time:
// exact regardless of the max-rows cap, and no giant `.in()` URLs.
const COUNT_CONCURRENCY = 10
// Chunk size for `.in()` id lists, to keep request URLs short.
const IN_CHUNK = 50

async function countMessages(db: ReadOnlyDb, sessionIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (let i = 0; i < sessionIds.length; i += COUNT_CONCURRENCY) {
    const batch = sessionIds.slice(i, i + COUNT_CONCURRENCY)
    const results = await Promise.all(
      batch.map(id => db.from('chat_messages').select('id', { count: 'exact', head: true }).eq('session_id', id)),
    )
    results.forEach((res, j) => {
      if (res.error) throw new Error(`Errore conteggio messaggi chat: ${res.error.message}`)
      counts.set(batch[j], res.count ?? 0)
    })
  }
  return counts
}

export async function listChatSessions(
  db: ReadOnlyDb,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ total: number; items: ChatSessionSummary[] }> {
  const limit = clampInt(opts.limit, 50, 1, 200)
  const offset = clampInt(opts.offset, 0, 0, Number.MAX_SAFE_INTEGER)

  const { data, error, count } = await db
    .from('chat_sessions')
    .select('id, title, created_at, updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(`Errore lettura sessioni chat: ${error.message}`)

  const sessions = (data ?? []) as SessionRow[]
  const counts = await countMessages(db, sessions.map(s => s.id))

  return {
    total: count ?? sessions.length,
    items: sessions.map(s => ({
      id: s.id,
      title: s.title,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      messageCount: counts.get(s.id) ?? 0,
    })),
  }
}

export async function getChatMessages(
  db: ReadOnlyDb,
  sessionId: string,
  opts: { limit?: number; offset?: number; order?: 'asc' | 'desc' } = {},
): Promise<{ sessionId: string; title: string | null; total: number; items: ChatMessageItem[] }> {
  const limit = clampInt(opts.limit, MESSAGES_DEFAULT_LIMIT, 1, MESSAGES_MAX_LIMIT)
  const offset = clampInt(opts.offset, 0, 0, Number.MAX_SAFE_INTEGER)
  const ascending = opts.order !== 'desc'

  const [sessionRes, msgRes] = await Promise.all([
    db.from('chat_sessions').select('id, title').eq('id', sessionId).maybeSingle(),
    // The user message and the reply of one turn can share created_at: tie-break
    // on role ('user' > 'assistant', so role DESC = user first when ascending),
    // then id, so ordering and pagination are deterministic.
    db
      .from('chat_messages')
      .select('id, role, content, created_at', { count: 'exact' })
      .eq('session_id', sessionId)
      .order('created_at', { ascending })
      .order('role', { ascending: !ascending })
      .order('id', { ascending })
      .range(offset, offset + limit - 1),
  ])
  if (sessionRes.error) throw new Error(`Errore lettura sessione chat: ${sessionRes.error.message}`)
  if (msgRes.error) throw new Error(`Errore lettura messaggi chat: ${msgRes.error.message}`)

  const rows = (msgRes.data ?? []) as Omit<MessageRow, 'session_id'>[]
  const session = sessionRes.data as { id: string; title: string } | null

  return {
    sessionId,
    title: session?.title ?? null,
    total: msgRes.count ?? rows.length,
    items: rows.map(m => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at })),
  }
}

function makeSnippet(content: string, query: string, size = 200): string {
  const idx = content.toLowerCase().indexOf(query.toLowerCase())
  if (content.length <= size) return content
  const center = idx >= 0 ? idx + Math.floor(query.length / 2) : 0
  let start = Math.max(0, center - Math.floor(size / 2))
  const end = Math.min(content.length, start + size)
  start = Math.max(0, end - size)
  return `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`
}

export async function searchChatMessages(
  db: ReadOnlyDb,
  opts: { query: string; role?: 'user' | 'assistant'; limit?: number },
): Promise<{ query: string; items: ChatSearchHit[] }> {
  const query = (opts.query ?? '').trim()
  if (!query) throw new Error('Errore ricerca chat: query vuota')
  const limit = clampInt(opts.limit, 30, 1, 100)

  let q = db
    .from('chat_messages')
    .select('id, session_id, role, content, created_at')
    .ilike('content', `%${escapeLike(query)}%`)
  if (opts.role) q = q.eq('role', opts.role)
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('role', { ascending: true })
    .order('id', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Errore ricerca messaggi chat: ${error.message}`)

  const rows = (data ?? []) as MessageRow[]
  const sessionIds = [...new Set(rows.map(r => r.session_id).filter(Boolean))]
  const titles = new Map<string, string>()
  for (let i = 0; i < sessionIds.length; i += IN_CHUNK) {
    const { data: sessions, error: sErr } = await db
      .from('chat_sessions')
      .select('id, title')
      .in('id', sessionIds.slice(i, i + IN_CHUNK))
    if (sErr) throw new Error(`Errore lettura sessioni chat: ${sErr.message}`)
    for (const s of (sessions ?? []) as { id: string; title: string }[]) titles.set(s.id, s.title)
  }

  return {
    query,
    items: rows.map(r => ({
      id: r.id,
      sessionId: r.session_id ?? null,
      sessionTitle: r.session_id ? titles.get(r.session_id) ?? null : null,
      role: r.role,
      createdAt: r.created_at,
      snippet: makeSnippet(r.content ?? '', query),
    })),
  }
}
