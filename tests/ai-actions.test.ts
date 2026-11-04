import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { signAIAction, verifyAIAction } from '../lib/aiActions'
import { aiActionRequestSchema, isValidProposalDate, parseSignedAIAction } from '../lib/aiActionSchema'

const secret = 'test-only-signing-secret'
const prepared = {
  kind: 'transaction.update',
  command: {
    operation: 'transactions.update',
    before: [{ id: '10000000-0000-4000-8000-000000000001', title: 'ChatGPT Plus [apple]', amount: 24, type: 'expense', created_at: '2026-11-04T12:00:00.000Z' }],
    after: [{ id: '10000000-0000-4000-8000-000000000001', title: 'ChatGPT Plus [apple]', amount: 23, type: 'expense', created_at: '2026-11-04T12:00:00.000Z' }],
  },
  preview: { title: 'Modifica transazione', fields: [{ label: 'Importo', before: '€24,00', after: '€23,00' }], warning: null },
} as const

describe('AI finance write actions', () => {
  it('signs a prepared action and binds it to the intended user', () => {
    const signed = signAIAction('user-1', prepared, secret)
    assert.equal(verifyAIAction(signed.confirmationToken, 'user-1', secret)?.action.kind, 'transaction.update')
    assert.equal(verifyAIAction(signed.confirmationToken, 'user-2', secret), null)
    assert.ok(parseSignedAIAction(signed))
  })

  it('rejects tampered, malformed, and extra-token signatures', () => {
    const signed = signAIAction('user-1', prepared, secret)
    const [payload, signature] = signed.confirmationToken.split('.')
    const changed = Buffer.from(JSON.stringify({ userId: 'user-1', requestId: signed.requestId, action: { ...prepared, kind: 'transaction.delete' } })).toString('base64url')
    assert.equal(verifyAIAction(`${changed}.${signature}`, 'user-1', secret), null)
    assert.equal(verifyAIAction(`${payload}.invalid`, 'user-1', secret), null)
    assert.equal(verifyAIAction(`${signed.confirmationToken}.extra`, 'user-1', secret), null)
  })

  it('validates structured write intents and rejects invalid inputs', () => {
    assert.equal(aiActionRequestSchema.safeParse({ type: 'transaction.delete', transactionId: '10000000-0000-4000-8000-000000000001' }).success, true)
    assert.equal(aiActionRequestSchema.safeParse({ type: 'transaction.update', transactionId: '10000000-0000-4000-8000-000000000001', changes: { amount: 1.234 } }).success, false)
    assert.equal(aiActionRequestSchema.safeParse({ type: 'wallet.delete', walletId: 'not-an-id' }).success, false)
    assert.equal(aiActionRequestSchema.safeParse({ type: 'transaction.create', date: '2026-11-04', wallet: 'apple', direction: 'expense', description: 'test', amount: 12, arbitrary: true }).success, false)
  })

  it('rejects impossible calendar dates', () => {
    assert.equal(isValidProposalDate('2024-02-29'), true)
    assert.equal(isValidProposalDate('2026-02-29'), false)
    assert.equal(isValidProposalDate('2026-13-01'), false)
  })
})
