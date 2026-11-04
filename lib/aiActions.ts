import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { isValidProposalDate, transactionProposalSchema, type TransactionProposal, type SignedTransactionProposal } from './aiActionSchema'

export { isValidProposalDate, transactionProposalSchema } from './aiActionSchema'
export type { TransactionProposal, SignedTransactionProposal } from './aiActionSchema'

function getSigningSecret(secret = process.env.GROQ_API_KEY) {
  if (!secret) throw new Error('GROQ_API_KEY non configurata')
  return secret
}

export function signTransactionProposal(
  userId: string,
  input: unknown,
  secret?: string,
): SignedTransactionProposal {
  const proposal = transactionProposalSchema.parse(input)
  if (!isValidProposalDate(proposal.date)) throw new Error('Data non valida')

  const requestId = randomUUID()
  const payload = Buffer.from(JSON.stringify({ userId, requestId, proposal })).toString('base64url')
  const signature = createHmac('sha256', getSigningSecret(secret)).update(payload).digest('base64url')
  return { ...proposal, requestId, confirmationToken: `${payload}.${signature}` }
}

export function verifyTransactionProposal(
  token: string,
  userId: string,
  secret?: string,
): { proposal: TransactionProposal; requestId: string } | null {
  let signingSecret: string
  try {
    signingSecret = getSigningSecret(secret)
  } catch {
    return null
  }

  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return null

  const expected = createHmac('sha256', signingSecret).update(payload).digest()
  let actual: Buffer
  try {
    actual = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId?: unknown
      requestId?: unknown
      proposal?: unknown
    }
    if (claims.userId !== userId || !z.string().uuid().safeParse(claims.requestId).success) return null
    const proposal = transactionProposalSchema.parse(claims.proposal)
    if (!isValidProposalDate(proposal.date)) return null
    return { proposal, requestId: claims.requestId as string }
  } catch {
    return null
  }
}
