import { z } from 'zod'

export const transactionProposalSchema = z.object({
  type: z.literal('transaction.create'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  wallet: z.string().trim().min(1).max(80),
  direction: z.enum(['income', 'expense']),
  description: z.string().trim().min(1).max(120),
  amount: z.number().finite().positive().max(1_000_000)
    .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8),
}).strict()

export const signedTransactionProposalSchema = transactionProposalSchema.extend({
  requestId: z.string().uuid(),
  confirmationToken: z.string().min(1).max(4096),
}).strict()

export type TransactionProposal = z.infer<typeof transactionProposalSchema>
export type SignedTransactionProposal = z.infer<typeof signedTransactionProposalSchema>

export function isValidProposalDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateString
}

export function parseSignedTransactionProposal(input: unknown): SignedTransactionProposal | null {
  const parsed = signedTransactionProposalSchema.safeParse(input)
  return parsed.success && isValidProposalDate(parsed.data.date) ? parsed.data : null
}
