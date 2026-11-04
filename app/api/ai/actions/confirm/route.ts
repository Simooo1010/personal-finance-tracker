import { createClient } from '@/lib/supabaseServer'
import { verifyAIAction } from '@/lib/aiActions'
import { preparedAIActionSchema } from '@/lib/aiActionSchema'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.token !== 'string' || body.token.length > 10000) {
    return Response.json({ error: 'Proposta non valida' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Non autorizzato' }, { status: 401 })

  const verified = verifyAIAction(body.token, user.id)
  if (!verified) return Response.json({ error: 'Proposta non valida o non autorizzata' }, { status: 400 })

  const { action, requestId } = verified
  const submittedProposal = preparedAIActionSchema.safeParse(body.proposal)
  if (!submittedProposal.success || JSON.stringify(submittedProposal.data) !== JSON.stringify(action)) {
    return Response.json({ error: 'I dettagli mostrati non corrispondono alla proposta firmata' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('execute_ai_write_once', {
    p_request_id: requestId,
    p_command: action.command,
  })
  if (error) {
    console.error('AI write confirmation failed:', error.message, error.code)
    if (error.code === 'PGRST202' || /execute_ai_write_once.*schema cache/i.test(error.message)) {
      return Response.json({ error: 'La funzione di scrittura AI non è ancora installata nel database. Applica supabase_migration_ai_writes.sql in Supabase, poi riprova.' }, { status: 503 })
    }
    if (error.code === '40001') return Response.json({ error: 'I dati sono cambiati dopo la proposta. Aggiorna la chat e chiedi di nuovo la modifica.' }, { status: 409 })
    return Response.json({ error: 'Non è stato possibile completare la modifica. Controlla i dati e riprova.' }, { status: 500 })
  }

  return Response.json({ result: data })
}
