import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidProposalDate,
  signTransactionProposal,
  transactionProposalSchema,
  verifyTransactionProposal,
} from '../lib/aiActions'
import { parseSignedTransactionProposal } from '../lib/aiActionSchema'

const secret = 'test-only-signing-secret'
const proposal = {
  type: 'transaction.create',
  date: '2026-11-04',
  wallet: 'busta',
  direction: 'expense',
  description: 'Libro',
  amount: 12.5,
} as const

describe('AI transaction proposals', () => {
  it('signs a normalized proposal and verifies it for the intended user', () => {
    const signed = signTransactionProposal('user-1', { ...proposal, description: '  Libro  ' }, secret)

    assert.equal(signed.description, 'Libro')
    assert.equal(signed.requestId.length, 36)
    assert.equal(verifyTransactionProposal(signed.confirmationToken, 'user-1', secret)?.proposal.description, 'Libro')
    assert.equal(verifyTransactionProposal(signed.confirmationToken, 'user-2', secret), null)
  })

  it('rejects a changed or malformed signature', () => {
    const signed = signTransactionProposal('user-1', proposal, secret)
    const [payload, signature] = signed.confirmationToken.split('.')
    const tamperedPayload = Buffer.from(JSON.stringify({ userId: 'user-1', requestId: signed.requestId, proposal: { ...proposal, amount: 99 } })).toString('base64url')

    assert.equal(verifyTransactionProposal(`${tamperedPayload}.${signature}`, 'user-1', secret), null)
    assert.equal(verifyTransactionProposal(`${payload}.not-a-signature`, 'user-1', secret), null)
    assert.equal(verifyTransactionProposal(`${signed.confirmationToken}.extra`, 'user-1', secret), null)
  })

  it('rejects incomplete, extra, non-positive, foreign-currency, and over-precision values', () => {
    assert.equal(transactionProposalSchema.safeParse({ ...proposal, amount: 0 }).success, false)
    assert.equal(transactionProposalSchema.safeParse({ ...proposal, amount: 1.234 }).success, false)
    assert.equal(transactionProposalSchema.safeParse({ ...proposal, amount: 10, arbitrary: true }).success, false)
    assert.equal(transactionProposalSchema.safeParse({ ...proposal, currency: 'USD' }).success, false)
    assert.equal(transactionProposalSchema.safeParse({ ...proposal, wallet: '' }).success, false)
    assert.equal(transactionProposalSchema.safeParse({ ...proposal, direction: 'transfer' }).success, false)
    assert.throws(() => signTransactionProposal('user-1', { ...proposal, amount: 0 }, secret))
  })

  it('accepts real calendar dates and rejects impossible or malformed dates', () => {
    assert.equal(isValidProposalDate('2024-02-29'), true)
    assert.equal(isValidProposalDate('2026-02-29'), false)
    assert.equal(isValidProposalDate('2026-13-01'), false)
    assert.equal(isValidProposalDate('04/11/2026'), false)
  })

  it('accepts only complete, well-formed proposals for display', () => {
    const signed = signTransactionProposal('user-1', proposal, secret)

    assert.deepEqual(parseSignedTransactionProposal(signed)?.requestId, signed.requestId)
    assert.equal(parseSignedTransactionProposal({ ...signed, date: '2026-02-29' }), null)
    assert.equal(parseSignedTransactionProposal({ ...signed, confirmationToken: '' }), null)
    assert.equal(parseSignedTransactionProposal({ ...signed, amount: 1e309 }), null)
  })
})
