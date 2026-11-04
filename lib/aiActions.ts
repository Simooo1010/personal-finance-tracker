import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { preparedAIActionSchema, type PreparedAIAction, type SignedAIAction } from './aiActionSchema'

function getSigningSecret(secret = process.env.GROQ_API_KEY) {
  if (!secret) throw new Error('GROQ_API_KEY non configurata')
  return secret
}

export function signAIAction(userId: string, input: unknown, secret?: string): SignedAIAction {
  const action = preparedAIActionSchema.parse(input)
  const requestId = randomUUID()
  const payload = Buffer.from(JSON.stringify({ userId, requestId, action })).toString('base64url')
  const signature = createHmac('sha256', getSigningSecret(secret)).update(payload).digest('base64url')
  return { ...action, requestId, confirmationToken: `${payload}.${signature}` }
}

export function verifyAIAction(
  token: string,
  userId: string,
  secret?: string,
): { action: PreparedAIAction; requestId: string } | null {
  let signingSecret: string
  try {
    signingSecret = getSigningSecret(secret)
  } catch {
    return null
  }

  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return null

  const expected = createHmac('sha256', signingSecret).update(payload).digest()
  const actual = Buffer.from(signature, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId?: unknown
      requestId?: unknown
      action?: unknown
    }
    if (claims.userId !== userId || typeof claims.requestId !== 'string') return null
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claims.requestId)) return null
    const action = preparedAIActionSchema.parse(claims.action)
    return { action, requestId: claims.requestId }
  } catch {
    return null
  }
}
