import { z } from 'zod'

const MAX_BODY_BYTES = 32 * 1024

export const oauthString = (max: number) => z.string().min(1).max(max).refine(value => !value.includes('\0'))
export const clientIdSchema = oauthString(256)

export const oauthNoStore = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }

/** Read a bounded JSON object, or a URL-encoded form at the token endpoint. */
export async function readOAuthBody(req: Request, acceptForm = false): Promise<Record<string, unknown> | null> {
  const type = req.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  const isForm = acceptForm && type === 'application/x-www-form-urlencoded'
  if ((!isForm && type !== 'application/json') || !req.body) return null

  const reader = req.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BODY_BYTES) return null
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    if (isForm) {
      const entries = [...new URLSearchParams(text)]
      if (new Set(entries.map(([key]) => key)).size !== entries.length) return null
      return Object.fromEntries(entries)
    }
    const body: unknown = JSON.parse(text)
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch {
    return null
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export const redirectUriSchema = oauthString(2048).refine(uri => {
  const authority = /^https?:\/\/([^/?#]+)/i.exec(uri)?.[1]
  if (!authority || authority.includes('@') || /[^\x21-\x7E]|[#\\]|%(?![0-9a-f]{2})/i.test(uri)) return false
  try {
    const url = new URL(uri)
    return url.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
})
