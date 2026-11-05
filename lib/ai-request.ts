import type { ZodType } from 'zod'
import { isGroqConfigured } from './groq'
import { isEmailAllowed } from './oauth/allowlist'
import { createClient } from './supabaseServer'

const REQUEST_DEADLINE_MS = 45_000

export class AiRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

export function aiRequestSignal(...signals: AbortSignal[]): AbortSignal {
  return AbortSignal.any([...signals, AbortSignal.timeout(REQUEST_DEADLINE_MS)])
}

export function aiAbortError(signal: AbortSignal): AiRequestError | undefined {
  if (!signal.aborted) return
  if (signal.reason?.name === 'TimeoutError') {
    return new AiRequestError(504, 'Tempo di attesa scaduto. Riprova.')
  }
  return new AiRequestError(408, 'Richiesta interrotta.')
}

export function aiErrorResponse(error: unknown, signal: AbortSignal) {
  const failure = aiAbortError(signal) ?? (error instanceof AiRequestError ? error : undefined)
  return Response.json(
    { error: failure?.message ?? 'Errore interno del server' },
    { status: failure?.status ?? 500 },
  )
}

async function readAiJson(req: Request, maxBytes: number, signal: AbortSignal): Promise<unknown> {
  const tooLarge = new AiRequestError(413, 'Richiesta troppo grande. Riduci il testo e riprova.')
  const malformed = new AiRequestError(400, 'Formato della richiesta non valido')
  if (Number(req.headers.get('content-length')) > maxBytes) throw tooLarge
  if (!req.body) throw malformed

  const reader = req.body.getReader()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let text = ''
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw tooLarge
      text += decoder.decode(value, { stream: true })
    }
    signal.throwIfAborted()
    return JSON.parse(text + decoder.decode())
  } catch (error) {
    cancel()
    throw error === tooLarge ? error : malformed
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}

export async function authorizeAiRequest<T>(
  req: Request,
  schema: ZodType<T>,
  maxBytes: number,
  signal: AbortSignal,
) {
  const mediaType = req.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (mediaType !== 'application/json') {
    throw new AiRequestError(415, 'Invia la richiesta in formato JSON')
  }
  const input = schema.safeParse(await readAiJson(req, maxBytes, signal))
  if (!input.success) throw new AiRequestError(400, 'Formato della richiesta non valido')

  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  signal.throwIfAborted()
  if (error || !user) throw new AiRequestError(401, 'Non autorizzato')
  if (!isEmailAllowed(user.email)) throw new AiRequestError(403, 'Funzionalità AI non autorizzata')
  if (!isGroqConfigured()) return Response.json({ enabled: false })

  return { supabase, user, input: input.data }
}

// A warm server instance can reject duplicate work immediately. No shared
// reservation is available across instances without an external coordinator.
const requestsByUser = new Map<string, Set<Set<string>>>()

export function acquireAiRequest(scope: 'chat' | 'analysis', userId: string, requestKey: string, limit = 1) {
  const userKey = `${scope}:${userId}`
  const active = requestsByUser.get(userKey) ?? new Set<Set<string>>()
  if (active.size >= limit || [...active].some(keys => keys.has(requestKey))) {
    throw new AiRequestError(429, 'Richiesta AI già in corso. Attendi e riprova.')
  }
  const keys = new Set([requestKey])
  active.add(keys)
  requestsByUser.set(userKey, active)

  return {
    addKey: (key: string) => keys.add(key),
    release() {
      if (active.delete(keys) && !active.size) requestsByUser.delete(userKey)
    },
  }
}
