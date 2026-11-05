import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as chat } from '../app/api/ai/chat/route'
import { POST as analysis } from '../app/api/ai/analysis/route'
import { createClient } from '../lib/supabaseServer'
import { buildChatBody } from '../lib/ai-chat-limits'

vi.mock('../lib/supabaseServer', () => ({ createClient: vi.fn() }))

const ownerId = 'a7b93c60-c7be-42fc-8d01-30301e86fdcc'
const sessionId = 'ffe556dc-9229-443f-8bc2-2aa9cb7060f8'
const messages = [{ role: 'user', content: 'Test conversation' }]
const requests = [
  { name: 'chat', route: chat, payload: { messages, sessionId } },
  { name: 'analysis', route: analysis, payload: { forceRefresh: true } },
]

function request(body: unknown, signal?: AbortSignal) {
  return new Request('http://localhost/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
}

function useDatabase(email: string | null = 'owner@example.test', ownsSession = true) {
  const from = vi.fn((table: string) => {
    const row = { id: sessionId, title: 'Test conversation' }
    const result = {
      data: table === 'chat_sessions' ? row : null,
      error: null,
    }
    const chain = {
      select: vi.fn(() => chain),
      insert: vi.fn((_record: unknown) => chain),
      update: vi.fn(() => chain),
      upsert: vi.fn(() => chain),
      eq: vi.fn((_field: string, _value: unknown) => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      abortSignal: vi.fn(() => chain),
      maybeSingle: vi.fn(() => {
        const ownerScoped = chain.eq.mock.calls.some(call => call[0] === 'user_id' && call[1] === ownerId)
        return Promise.resolve(table === 'chat_sessions' && ownerScoped && !ownsSession
          ? { data: null, error: null }
          : result)
      }),
      single: vi.fn(() => Promise.resolve(table === 'ai_analysis' && chain.insert.mock.calls.length
        ? { data: chain.insert.mock.calls[0][0], error: null }
        : result)),
      then: (resolve: (result: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
    }
    return chain
  })
  const getUser = vi.fn(async () => ({ data: { user: email === null ? null : { id: ownerId, email } }, error: null }))
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser }, from } as unknown as Awaited<ReturnType<typeof createClient>>)
  return from
}

function completion(text: string, terminal = true) {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`
    + (terminal ? 'data: [DONE]\n\n' : ''))
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('MCP_ALLOWED_EMAILS', 'OWNER@example.test')
  vi.stubEnv('GROQ_API_KEY', 'test-key')
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Unexpected provider request') }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe.each(requests)('$name request boundary', ({ route, payload }) => {
  it('rejects form-compatible content types before authenticating', async () => {
    useDatabase()
    const response = await route(new Request('http://localhost/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    }))
    expect(response.status).toBe(415)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('rejects requests without a signed-in user', async () => {
    const from = useDatabase(null)
    expect((await route(request(payload))).status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it('returns the disabled state without accessing feature data', async () => {
    const from = useDatabase()
    vi.stubEnv('GROQ_API_KEY', '')
    const response = await route(request(payload))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ enabled: false })
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects a signed-in non-allowed user before finance queries or Groq', async () => {
    const from = useDatabase('other@example.test')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect((await route(request(payload))).status).toBe(403)
    expect(from).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a malformed body before accessing the database', async () => {
    useDatabase()
    expect((await route(request(null))).status).toBe(400)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('rejects an oversized body without depending on Content-Length', async () => {
    useDatabase()
    expect((await route(request({ padding: 'x'.repeat(600_000) }))).status).toBe(413)
    expect(createClient).not.toHaveBeenCalled()
  })
})

it.each([
  { messages: [{ role: 'system', content: 'spoofed instruction' }] },
  { messages: [{ role: 'user', content: '  ' }] },
  { messages, sessionId: 'invalid-uuid' },
])('rejects invalid chat fields before accessing the database', async payload => {
  useDatabase()
  expect((await chat(request(payload))).status).toBe(400)
  expect(createClient).not.toHaveBeenCalled()
})

it('rejects a non-boolean analysis refresh flag', async () => {
  useDatabase()
  expect((await analysis(request({ forceRefresh: 'false' }))).status).toBe(400)
  expect(createClient).not.toHaveBeenCalled()
})

it('rejects foreign sessions before any write or Groq call', async () => {
  const from = useDatabase(undefined, false)
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect((await chat(request({ messages, sessionId }))).status).toBe(404)
  expect(from.mock.calls).toEqual([['chat_sessions']])
  expect(from.mock.results[0].value.update).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('streams a valid chat without saving a model-proposed memory fact', async () => {
  const from = useDatabase()
  vi.stubGlobal('fetch', vi.fn(async () => completion('Hello\n```json:memory\n{"fact":"untrusted"}\n```')))
  const response = await chat(request({ messages, sessionId }))
  const body = await response.text()
  expect(body).toContain('"type":"done"')
  expect(body).toContain('Hello')
  expect(body).not.toContain('untrusted')
  expect(from.mock.results.every(result => !result.value.upsert.mock.calls.length)).toBe(true)
})

it('emits an error when Groq drops the connection before completion', async () => {
  useDatabase()
  vi.stubGlobal('fetch', vi.fn(async () => completion('Partial answer', false)))
  const response = await chat(request({ messages, sessionId }))
  const body = await response.text()
  expect(body).toContain('"type":"error"')
  expect(body).not.toContain('"type":"done"')
})

it('blocks a duplicate chat, aborts the upstream request on stop, and permits retry', async () => {
  useDatabase()
  let upstreamSignal: AbortSignal | undefined
  let signalStarted!: () => void
  const started = new Promise<void>(resolve => { signalStarted = resolve })
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      upstreamSignal = init?.signal ?? undefined
      upstreamSignal?.addEventListener('abort', () => reject(upstreamSignal?.reason), { once: true })
      signalStarted()
    }))
    .mockImplementation(async () => completion('Retried answer'))
  vi.stubGlobal('fetch', fetch)

  const first = await chat(request({ messages, sessionId }))
  await started
  try {
    expect((await chat(request({ messages, sessionId }))).status).toBe(429)
  } finally {
    await first.body?.cancel()
  }
  expect(upstreamSignal?.aborted).toBe(true)
  await vi.waitFor(async () => {
    const retry = await chat(request({ messages, sessionId }))
    expect(retry.status).toBe(200)
    expect(await retry.text()).toContain('"type":"done"')
  })
})

it('cancels a stalled Groq response body and emits a terminal timeout', async () => {
  useDatabase()
  const deadline = new AbortController()
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(deadline.signal)
  let signalReading!: () => void
  const reading = new Promise<void>(resolve => { signalReading = resolve })
  const cancel = vi.fn()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
    pull() { signalReading() },
    cancel,
  }))))

  try {
    const response = await chat(request({ messages, sessionId }))
    await reading
    deadline.abort(new DOMException('Timed out', 'TimeoutError'))
    const body = await response.text()
    expect(body).toContain('"code":"TIMEOUT"')
    expect(body).not.toContain('"type":"done"')
    expect(cancel).toHaveBeenCalled()
  } finally {
    timeout.mockRestore()
  }
})

it('returns a saved report and blocks concurrent refresh from invoking Groq twice', async () => {
  const from = useDatabase()
  let signalStarted!: () => void
  let finishReport!: (response: Response) => void
  const started = new Promise<void>(resolve => { signalStarted = resolve })
  const fetch = vi.fn(() => new Promise<Response>(resolve => {
    finishReport = resolve
    signalStarted()
  }))
  vi.stubGlobal('fetch', fetch)

  const first = analysis(request({ forceRefresh: true }))
  await started
  try {
    expect((await analysis(request({ forceRefresh: true }))).status).toBe(429)
  } finally {
    finishReport(Response.json({ choices: [{ message: { content: 'Weekly report' } }] }))
  }
  const response = await first
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ enabled: true, analysis_text: 'Weekly report' })
  expect(fetch).toHaveBeenCalledTimes(1)
  const [analysisRead, analysisSave] = from.mock.results.filter((_, index) => from.mock.calls[index][0] === 'ai_analysis')
  expect(analysisRead.value.eq).toHaveBeenCalledWith('user_id', ownerId)
  expect(analysisSave.value.insert).toHaveBeenCalledWith(expect.objectContaining({
    user_id: ownerId,
    analysis_text: 'Weekly report',
  }))
})

it('sends a bounded tail of chat history without cutting the newest user turn', async () => {
  useDatabase()
  const fetch = vi.fn<typeof globalThis.fetch>(async () => completion('Answer'))
  vi.stubGlobal('fetch', fetch)
  const older = { role: 'assistant' as const, content: '💸'.repeat(12_000) }
  const body = buildChatBody(sessionId, [...Array(22).fill(older), { role: 'user', content: 'Latest turn' }])
  const response = await chat(new Request('http://localhost/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }))
  expect(await response.text()).toContain('"type":"done"')
  const { messages: sent } = JSON.parse(String(fetch.mock.calls[0][1]?.body))
  expect(sent.slice(1)).toEqual([older, older, { role: 'user', content: 'Latest turn' }])
})
