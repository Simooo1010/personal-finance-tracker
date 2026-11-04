import { createClient } from '@/lib/supabaseServer'
import { isValidProposalDate, transactionProposalSchema, verifyTransactionProposal } from '@/lib/aiActions'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.token !== 'string' || body.token.length > 4096) {
    return Response.json({ error: 'Proposta non valida' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Non autorizzato' }, { status: 401 })

  const verified = verifyTransactionProposal(body.token, user.id)
  if (!verified) return Response.json({ error: 'Proposta non valida o non autorizzata' }, { status: 400 })

  const { proposal, requestId } = verified
  const submittedProposal = transactionProposalSchema.safeParse(body.proposal)
  if (!submittedProposal.success || JSON.stringify(submittedProposal.data) !== JSON.stringify(proposal)) {
    return Response.json({ error: 'I dettagli mostrati non corrispondono alla proposta firmata' }, { status: 400 })
  }
  if (!isValidProposalDate(proposal.date)) {
    return Response.json({ error: 'Data non valida' }, { status: 400 })
  }
  const date = new Date(`${proposal.date}T12:00:00.000Z`)

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
