import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { createClient } from '@/lib/supabaseServer'

const proposalSchema = z.object({
  type: z.literal('transaction.create'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  wallet: z.string().min(1).max(80),
  direction: z.enum(['income', 'expense']),
  description: z.string().trim().min(1).max(120),
  amount: z.number().finite().positive().max(1_000_000)
    .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8),
}).strict()

function verifyToken(token: string, userId: string) {
  const secret = process.env.GROQ_API_KEY
  if (!secret) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return null

  const expected = createHmac('sha256', secret).update(payload).digest()
  let actual: Buffer
  try {
    actual = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const proposal = proposalSchema.parse(claims.proposal)
    if (claims.userId !== userId || !z.string().uuid().safeParse(claims.requestId).success) return null
    return { proposal, requestId: claims.requestId as string }
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.token !== 'string' || body.token.length > 4096) {
    return Response.json({ error: 'Proposta non valida' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Non autorizzato' }, { status: 401 })

  const verified = verifyToken(body.token, user.id)
  if (!verified) return Response.json({ error: 'Proposta non valida o non autorizzata' }, { status: 400 })

  const { proposal, requestId } = verified
  const submittedProposal = proposalSchema.safeParse(body.proposal)
  if (!submittedProposal.success || JSON.stringify(submittedProposal.data) !== JSON.stringify(proposal)) {
    return Response.json({ error: 'I dettagli mostrati non corrispondono alla proposta firmata' }, { status: 400 })
  }
  const date = new Date(`${proposal.date}T12:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== proposal.date) {
    return Response.json({ error: 'Data non valida' }, { status: 400 })
  }

  const { data: wallet } = await supabase
    .from('wallets')
    .select('slug')
    .eq('user_id', user.id)
    .eq('slug', proposal.wallet)
    .maybeSingle()
  if (!wallet) return Response.json({ error: 'Il portafoglio selezionato non esiste più' }, { status: 409 })

  const { data, error } = await supabase.rpc('create_ai_transaction_once', {
    p_request_id: requestId,
    p_title: `${proposal.description} [${proposal.wallet}]`,
    p_amount: proposal.amount,
    p_type: proposal.direction,
    p_created_at: date.toISOString(),
  })
  if (error) {
    console.error('AI transaction confirmation failed:', error.message)
    return Response.json({ error: 'Non è stato possibile salvare la transazione. Riprova.' }, { status: 500 })
  }

  return Response.json({ transaction: data })
}
