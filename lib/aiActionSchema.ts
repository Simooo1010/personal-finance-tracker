import { z } from 'zod'

const money = z.number().finite().positive().max(1_000_000)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Data non valida')
const slug = z.string().trim().min(1).max(80).regex(/^[a-z0-9_-]+$/)
const shortText = (max = 120) => z.string().trim().min(1).max(max)
const transactionChanges = z.object({
  description: shortText().optional(),
  amount: money.optional(),
  direction: z.enum(['income', 'expense']).optional(),
  date: date.optional(),
  wallet: slug.optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Indica almeno una modifica')

const debtChanges = z.object({
  person: shortText(100).optional(),
  description: shortText().optional(),
  debtType: z.enum(['to_me', 'by_me']).optional(),
  amount: money.optional(),
  date: date.optional(),
  wallet: slug.optional(),
  status: z.enum(['active', 'completed']).optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Indica almeno una modifica')

const walletChanges = z.object({
  name: shortText(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Indica almeno una modifica')

export const aiActionRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('transaction.create'), date, wallet: slug, direction: z.enum(['income', 'expense']), description: shortText(), amount: money }).strict(),
  z.object({ type: z.literal('transaction.update'), transactionId: z.string().uuid(), changes: transactionChanges }).strict(),
  z.object({ type: z.literal('transaction.delete'), transactionId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('debt.create'), date, wallet: slug, debtType: z.enum(['to_me', 'by_me']), person: shortText(100), description: shortText(), amount: money }).strict(),
  z.object({ type: z.literal('debt.update'), transactionId: z.string().uuid(), changes: debtChanges }).strict(),
  z.object({ type: z.literal('debt.delete'), transactionId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('debt.set_status'), transactionId: z.string().uuid(), status: z.enum(['active', 'completed']) }).strict(),
  z.object({ type: z.literal('transfer.create'), date, sourceWallet: slug, destinationWallet: slug, description: shortText().optional(), amount: money }).strict(),
  z.object({ type: z.literal('transfer.update'), transactionId: z.string().uuid(), changes: z.object({ date: date.optional(), sourceWallet: slug.optional(), destinationWallet: slug.optional(), amount: money.optional() }).strict().refine(value => Object.keys(value).length > 0) }).strict(),
  z.object({ type: z.literal('transfer.delete'), transactionId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('wallet.create'), name: shortText(100), description: z.string().trim().max(500).nullable().optional() }).strict(),
  z.object({ type: z.literal('wallet.update'), walletId: z.string().uuid(), changes: walletChanges }).strict(),
  z.object({ type: z.literal('wallet.delete'), walletId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('memory.replace'), text: z.string().trim().max(6000) }).strict(),
])

export type AIActionRequest = z.infer<typeof aiActionRequestSchema>

export const transactionRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(220),
  amount: z.number().finite().positive().max(1_000_000),
  type: z.enum(['income', 'expense']),
  created_at: z.string().datetime({ offset: true }),
}).strict()

export const transactionRecordSchema = z.object({
  title: z.string().max(220),
  amount: money,
  type: z.enum(['income', 'expense']),
  created_at: z.string().datetime({ offset: true }),
}).strict()

export const walletRowSchema = z.object({
  id: z.string().uuid(),
  slug,
  name: z.string().max(100),
  description: z.string().max(500).nullable(),
  position: z.number().int().nonnegative(),
}).strict()

export const walletRecordSchema = z.object({
  slug,
  name: shortText(100),
  description: z.string().max(500).nullable(),
  position: z.number().int().nonnegative(),
}).strict()

export const aiWriteCommandSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('transactions.insert'), records: z.array(transactionRecordSchema).min(1).max(2) }).strict(),
  z.object({ operation: z.literal('transactions.update'), before: z.array(transactionRowSchema).min(1).max(2), after: z.array(transactionRowSchema).min(1).max(2) }).strict(),
  z.object({ operation: z.literal('transactions.delete'), before: z.array(transactionRowSchema).min(1).max(1000) }).strict(),
  z.object({ operation: z.literal('wallets.insert'), record: walletRecordSchema }).strict(),
  z.object({ operation: z.literal('wallets.update'), before: walletRowSchema, after: walletRecordSchema }).strict(),
  z.object({ operation: z.literal('wallets.delete'), before: walletRowSchema, transactions: z.array(transactionRowSchema).max(1000) }).strict(),
  z.object({ operation: z.literal('memory.replace'), before: z.string().max(6000), after: z.string().max(6000) }).strict(),
])

export type AIWriteCommand = z.infer<typeof aiWriteCommandSchema>

export const aiActionPreviewSchema = z.object({
  title: z.string().min(1).max(100),
  fields: z.array(z.object({
    label: z.string().min(1).max(60),
    before: z.string().max(6000).nullable(),
    after: z.string().max(6000).nullable(),
  }).strict()).min(1).max(20),
  warning: z.string().max(500).nullable(),
}).strict()

export const preparedAIActionSchema = z.object({
  kind: z.string().min(1).max(40),
  command: aiWriteCommandSchema,
  preview: aiActionPreviewSchema,
}).strict()

export const signedAIActionSchema = preparedAIActionSchema.extend({
  requestId: z.string().uuid(),
  confirmationToken: z.string().min(1).max(8192),
}).strict()

export type PreparedAIAction = z.infer<typeof preparedAIActionSchema>
export type SignedAIAction = z.infer<typeof signedAIActionSchema>

export function isValidProposalDate(dateString: string) {
  const parsed = date.safeParse(dateString)
  if (!parsed.success) return false
  const value = new Date(`${dateString}T00:00:00.000Z`)
  return !Number.isNaN(value.getTime()) && value.toISOString().slice(0, 10) === dateString
}

export function parseSignedAIAction(input: unknown): SignedAIAction | null {
  const parsed = signedAIActionSchema.safeParse(input)
  return parsed.success ? parsed.data : null
}
