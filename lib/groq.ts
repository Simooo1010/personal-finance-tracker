/**
 * Minimal client for the Groq Cloud chat-completions API.
 *
 * Groq exposes an OpenAI-compatible endpoint, so a plain `fetch` is enough and
 * keeps the app free of extra dependencies (the previous Vertex AI integration
 * was hand-rolled for the same reason).
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

/**
 * Groq deprecated the Llama models on the free tier in June 2026 and points
 * free/developer accounts at the GPT-OSS family instead. Override with
 * GROQ_MODEL if a different model is preferred.
 */
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b'

export type GroqRole = 'system' | 'user' | 'assistant'

export type GroqMessage = {
  role: GroqRole
  content: string
}

export type GroqCallOptions = {
  system: string
  messages: GroqMessage[]
  temperature?: number
  /** Upper bound on visible output + reasoning tokens. */
  maxTokens?: number
  /** Only sent for models that support it (GPT-OSS / Qwen reasoning models). */
  reasoningEffort?: 'low' | 'medium' | 'high'
}

export class GroqError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'GroqError'
    this.code = code
    this.status = status
  }
}

export function getGroqModel(): string {
  return process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL
}

/** The AI features are only exposed when an API key is configured. */
export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY)
}

/** `reasoning_effort` / `include_reasoning` are rejected by non-reasoning models. */
function supportsReasoningControls(model: string): boolean {
  return model.startsWith('openai/gpt-oss') || model.startsWith('qwen/')
}

/**
 * Some reasoning models inline their chain of thought in the message content
 * instead of the dedicated `reasoning` field. Strip it so it never reaches the UI.
 */
function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

function mapErrorStatus(status: number, apiMessage: string): GroqError {
  if (status === 401 || status === 403) {
    return new GroqError(
      'INVALID_API_KEY',
      'Chiave API Groq non valida o non autorizzata. Controlla GROQ_API_KEY.',
      status
    )
  }
  if (status === 429) {
    return new GroqError(
      'QUOTA_EXCEEDED',
      'Limite di richieste Groq raggiunto. Riprova tra qualche minuto.',
      status
    )
  }
  if (status === 413) {
    return new GroqError(
      'REQUEST_TOO_LARGE',
      'Troppi dati inviati al modello. Riprova con una conversazione più corta.',
      status
    )
  }
  return new GroqError('GROQ_API_ERROR', apiMessage || 'Errore nella chiamata API di Groq', status)
}

/**
 * Sends a single completion request and returns the assistant text.
 * Throws a `GroqError` carrying a user-facing Italian message on failure.
 */
export async function callGroq({
  system,
  messages,
  temperature = 0.7,
  maxTokens = 4096,
  reasoningEffort = 'low',
}: GroqCallOptions): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new GroqError('NOT_CONFIGURED', 'GROQ_API_KEY non configurata', 500)
  }

  const model = getGroqModel()

  const baseBody: Record<string, unknown> = {
    model,
    messages: [{ role: 'system', content: system }, ...messages],
    temperature,
    max_completion_tokens: maxTokens,
    stream: false,
  }

  const send = (body: Record<string, unknown>) =>
    fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

  const withReasoning = supportsReasoningControls(model)
  let response = await send(
    withReasoning
      ? { ...baseBody, reasoning_effort: reasoningEffort, include_reasoning: false }
      : baseBody
  )

  // A model may reject the reasoning knobs (they are model-specific and the set
  // of supporting models changes); fall back to the plain request rather than
  // failing the whole feature.
  if (!response.ok && response.status === 400 && withReasoning) {
    response = await send(baseBody)
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw mapErrorStatus(response.status, errorData?.error?.message)
  }

  const data = await response.json()
  const text = stripReasoning(data.choices?.[0]?.message?.content || '')

  if (!text) {
    throw new GroqError('EMPTY_RESPONSE', 'Nessuna risposta generata dal modello', 500)
  }

  return text
}

/**
 * Same request as `callGroq`, but asks Groq to stream the completion back as
 * Server-Sent Events and yields each incremental text delta as it arrives.
 *
 * Reasoning-model `<think>` blocks can straddle chunk boundaries, so unlike
 * `stripReasoning` (which runs once on a complete string) this buffers the
 * tail of the text and only yields what's provably outside an open `<think>`
 * tag, holding back a small amount so a tag split across chunks isn't missed.
 */
export async function* streamGroq({
  system,
  messages,
  temperature = 0.7,
  maxTokens = 4096,
  reasoningEffort = 'low',
}: GroqCallOptions): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new GroqError('NOT_CONFIGURED', 'GROQ_API_KEY non configurata', 500)
  }

  const model = getGroqModel()

  const baseBody: Record<string, unknown> = {
    model,
    messages: [{ role: 'system', content: system }, ...messages],
    temperature,
    max_completion_tokens: maxTokens,
    stream: true,
  }

  const send = (body: Record<string, unknown>) =>
    fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

  const withReasoning = supportsReasoningControls(model)
  let response = await send(
    withReasoning
      ? { ...baseBody, reasoning_effort: reasoningEffort, include_reasoning: false }
      : baseBody
  )

  if (!response.ok && response.status === 400 && withReasoning) {
    response = await send(baseBody)
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw mapErrorStatus(response.status, errorData?.error?.message)
  }

  if (!response.body) {
    throw new GroqError('EMPTY_RESPONSE', 'Nessuna risposta generata dal modello', 500)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let pending = ''
  let sawAnyDelta = false

  const flushSafe = function* (finalFlush: boolean) {
    // Hold back enough trailing text that a `<think>`/`</think>` tag split
    // across two chunks is never partially yielded.
    const holdBack = finalFlush ? 0 : 8
    while (true) {
      const openIdx = pending.indexOf('<think>')
      const closeIdx = pending.indexOf('</think>')

      if (closeIdx !== -1 && (openIdx === -1 || closeIdx < openIdx)) {
        // Stray closing tag with no open before it — drop it defensively.
        pending = pending.slice(closeIdx + '</think>'.length)
        continue
      }

      if (openIdx === -1) {
        const safeLen = Math.max(0, pending.length - holdBack)
        if (safeLen > 0) {
          yield pending.slice(0, safeLen)
          pending = pending.slice(safeLen)
        }
        return
      }

      // Emit everything before the reasoning block, then drop the block
      // itself once (and if) its closing tag has arrived.
      if (openIdx > 0) yield pending.slice(0, openIdx)
      const afterOpen = pending.slice(openIdx + '<think>'.length)
      const closeInRest = afterOpen.indexOf('</think>')
      if (closeInRest === -1) {
        // Still inside the reasoning block — nothing more is safe to emit.
        pending = '<think>' + afterOpen
        return
      }
      pending = afterOpen.slice(closeInRest + '</think>'.length)
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') continue

        try {
          const json = JSON.parse(payload)
          const delta: string = json.choices?.[0]?.delta?.content || ''
          if (delta) {
            sawAnyDelta = true
            pending += delta
            yield* flushSafe(false)
          }
        } catch {
          // Ignore malformed SSE lines (e.g. keep-alive comments).
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  yield* flushSafe(true)

  if (!sawAnyDelta) {
    throw new GroqError('EMPTY_RESPONSE', 'Nessuna risposta generata dal modello', 500)
  }
}
