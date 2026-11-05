export const MAX_CHAT_BODY_BYTES = 128 * 1024
export const MAX_CHAT_MESSAGES = 20
export const MAX_CHAT_MESSAGE_LENGTH = 32_000

type ChatInputMessage = { role: 'user' | 'assistant'; content: string }

export function buildChatBody(sessionId: string | null, messages: ChatInputMessage[]): string {
  const encoder = new TextEncoder()
  let size = encoder.encode(JSON.stringify({ sessionId, messages: [] })).byteLength
  const entries: ChatInputMessage[] = []

  for (const { role, content } of messages.slice(-MAX_CHAT_MESSAGES).reverse()) {
    if (!content.trim()) continue
    const entry = { role, content }
    // Always submit the newest user turn so the route can report its size error.
    if (content.length > MAX_CHAT_MESSAGE_LENGTH && entries.length) break
    size += encoder.encode(JSON.stringify(entry)).byteLength + (entries.length ? 1 : 0)
    if (size > MAX_CHAT_BODY_BYTES && entries.length) break
    entries.push(entry)
  }

  return JSON.stringify({ sessionId, messages: entries.reverse() })
}
