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
