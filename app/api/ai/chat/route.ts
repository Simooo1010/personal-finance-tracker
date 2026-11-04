import { createClient } from '@/lib/supabaseServer'
import { parseTransaction, getTransactionEffect, getWalletBalances } from '@/lib/transactions'
import { streamGroq, GroqError, isGroqConfigured, type GroqMessage } from '@/lib/groq'

/**
 * Groq's free tier is rate limited by tokens-per-minute, so only the tail of a
 * long conversation is replayed to the model on each turn.
 */
const MAX_HISTORY_MESSAGES = 20

/**
 * NDJSON event types written to the response stream, one JSON object per line:
 * - {type:'session', sessionId, sessionTitle}  — sent immediately, before any
 *   model output, so the client can tag this generation to a session even if
 *   the user navigates away before the first token arrives.
 * - {type:'delta', text}                       — an incremental text chunk.
 * - {type:'error', code, message}
 * - {type:'done'}
 */
type StreamEvent =
  | { type: 'session'; sessionId: string; sessionTitle: string }
  | { type: 'delta'; text: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'done'; exportBlocks: string[] }

function encodeEvent(event: StreamEvent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event) + '\n')
}

/**
 * The system prompt asks the model to end its reply with invisible
 * ```json:memory``` / ```json:export``` fenced blocks. Neither should ever
 * flash on screen as raw text while streaming. `json:memory` is pure server
 * bookkeeping and is dropped entirely. `json:export` still needs to reach the
 * client (to render as a download card and be persisted for reloads), so
 * completed export blocks are captured separately instead of being emitted
 * as regular deltas — the caller appends them once the stream ends.
 */
function createProtocolBlockFilter() {
  let buf = ''
  let emittedLen = 0
  let awaitingCloseOfSuppressed: 'memory' | 'export' | null = null
  const exportBlocks: string[] = []

  function* drain(): Generator<string> {
    while (true) {
      const fenceIdx = buf.indexOf('```', emittedLen)

      if (fenceIdx === -1) {
        // No pending fence — safe to emit everything except a short tail,
        // in case a chunk boundary splits the ``` marker itself.
        const safeEnd = Math.max(emittedLen, buf.length - 2)
        if (safeEnd > emittedLen) {
          yield buf.slice(emittedLen, safeEnd)
          emittedLen = safeEnd
        }
        return
      }

      if (fenceIdx > emittedLen) {
        yield buf.slice(emittedLen, fenceIdx)
        emittedLen = fenceIdx
      }

      const afterFence = fenceIdx + 3
      const newlineIdx = buf.indexOf('\n', afterFence)
      if (newlineIdx === -1) {
        // Language tag hasn't fully arrived yet — wait for more data.
        return
      }

      const lang = buf.slice(afterFence, newlineIdx).trim()
      if (lang === 'json:memory' || lang === 'json:export') {
        const closeIdx = buf.indexOf('```', newlineIdx + 1)
        if (closeIdx === -1) {
          awaitingCloseOfSuppressed = lang === 'json:memory' ? 'memory' : 'export'
          return
        }
        awaitingCloseOfSuppressed = null
        const blockEnd = closeIdx + 3
        if (lang === 'json:export') exportBlocks.push(buf.slice(fenceIdx, blockEnd))
        emittedLen = blockEnd
        continue
      }

      // An ordinary fence (a real code block) — safe to pass through.
      yield buf.slice(emittedLen, newlineIdx + 1)
      emittedLen = newlineIdx + 1
    }
  }

  return {
    feed(delta: string): string[] {
      buf += delta
      return Array.from(drain())
    },
    /** Call once the model has finished. Returns any final safe text delta. */
    finish(): string[] {
      if (awaitingCloseOfSuppressed === 'export') {
        // Truncated (e.g. hit the token limit) — best-effort capture so the
        // client can still try to parse it rather than silently lose it.
        exportBlocks.push(buf.slice(emittedLen))
        emittedLen = buf.length
        return []
      }
      if (awaitingCloseOfSuppressed === 'memory') {
        emittedLen = buf.length
        return []
      }
      const remaining = buf.slice(emittedLen)
      emittedLen = buf.length
      return remaining ? [remaining] : []
    },
    fullText(): string {
      return buf
    },
    exportBlocks(): string[] {
      return exportBlocks
    },
  }
}

export async function POST(req: Request) {
  if (!isGroqConfigured()) {
    return Response.json({ enabled: false }, { status: 200 })
  }

  const { messages, sessionId } = await req.json().catch(() => ({ messages: null, sessionId: null }))
  if (!messages || !Array.isArray(messages)) {
    return Response.json({ error: 'Messaggi mancanti o formato non valido' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  // Resolve (or create) the session up front, before any model call, so the
  // client can immediately tag this generation to a session id — that's what
  // lets a reply keep streaming in the background if the user switches chats.
  let currentSessionId: string = sessionId
  let sessionTitle = 'Nuova chat'
  const userFirstMsg = messages.find((m: any) => m.role === 'user')?.content || 'Nuova chat'
  const generatedTitle = userFirstMsg.length > 35 ? `${userFirstMsg.slice(0, 35)}...` : userFirstMsg

  if (currentSessionId) {
    const { data: existingSession } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', currentSessionId)
      .maybeSingle()

    if (existingSession) {
      sessionTitle = existingSession.title === 'Nuova chat' ? generatedTitle : existingSession.title
      await supabase
        .from('chat_sessions')
        .update({ title: sessionTitle, updated_at: new Date().toISOString() })
        .eq('id', currentSessionId)
    }
  } else {
    const { data: newSession, error: newSessErr } = await supabase
      .from('chat_sessions')
      .insert({ user_id: user.id, title: generatedTitle, updated_at: new Date().toISOString() })
      .select()
      .single()

    if (!newSessErr && newSession) {
      currentSessionId = newSession.id
      sessionTitle = newSession.title
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encodeEvent({ type: 'session', sessionId: currentSessionId, sessionTitle }))

      try {
        // Fetch long-term memory & past session titles
        const { data: memoryData } = await supabase
          .from('user_ai_memory')
          .select('memory_text')
          .eq('user_id', user.id)
          .maybeSingle()
        const userMemoryText = memoryData?.memory_text || ''

        const { data: pastSessions } = await supabase
          .from('chat_sessions')
          .select('id, title, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(10)
        const pastTopicsText = pastSessions && pastSessions.length > 0
          ? pastSessions.map(s => `- ${s.title}`).join('\n')
          : 'Nessuna conversazione precedente.'

        // Fetch financial context
        const { data: wallets, error: walletsError } = await supabase
          .from('wallets')
          .select('*')
          .eq('user_id', user.id)
          .order('position')
        if (walletsError || !wallets) throw new Error('Errore nel caricamento dei portafogli')

        const { data: transactions, error: txError } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
        if (txError || !transactions) throw new Error('Errore nel caricamento delle transazioni')

        const defaultWallet = wallets.find(w => w.position === 0)?.slug || 'generale'
        const walletSlugs = wallets.map(w => w.slug)
        const walletMap = wallets.reduce((acc, w) => {
          acc[w.slug] = w.name
          return acc
        }, {} as Record<string, string>)

        const balances = getWalletBalances(transactions, walletSlugs, defaultWallet)
        const netWorth = Object.values(balances).reduce((sum, bal) => sum + bal, 0)

        const walletDetails = wallets.map(w => `- ${w.name}: €${(balances[w.slug] || 0).toFixed(2)}`).join('\n')

        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

        const recentRealTx = transactions
          .filter(t => !t.title.endsWith('-transfer]'))
          .filter(t => new Date(t.created_at) >= thirtyDaysAgo)

        const formattedTxList = recentRealTx.slice(0, 20).map(t => {
          const parsed = parseTransaction(t, defaultWallet)
          const date = new Date(t.created_at).toLocaleDateString('it-IT')
          return `- [${date}] ${t.type === 'income' ? 'Entrata' : 'Uscita'} su [${walletMap[parsed.wallet] || parsed.wallet}]: "${parsed.cleanTitle}" (€${Number(t.amount).toFixed(2)})`
        }).join('\n')

        const debtsList = transactions
          .map(t => ({ amount: Number(t.amount), ...parseTransaction(t, defaultWallet) }))
          .filter(item => item.isDebt && item.debtInfo !== null)

        const activeCredits = debtsList.filter(d => d.debtInfo?.type === 'to_me' && d.debtInfo.status === 'active')
        const totalCredits = activeCredits.reduce((s, c) => s + c.amount, 0)

        const activeDebts = debtsList.filter(d => d.debtInfo?.type === 'by_me' && d.debtInfo.status === 'active')
        const totalDebts = activeDebts.reduce((s, d) => s + d.amount, 0)

        const formattedDebtsList = debtsList
          .filter(d => d.debtInfo?.status === 'active')
          .map(d => `- ${d.debtInfo?.type === 'to_me' ? 'Credito da' : 'Debito verso'} ${d.debtInfo?.person}: "${d.debtInfo?.desc}" (€${d.amount.toFixed(2)})`)
          .join('\n')

        const systemPrompt = `Sei un assistente virtuale di finanza personale avanzato integrato nell'app di tracciamento spese dell'utente (stile ChatGPT). Il tuo stile è estremamente amichevole, empatico, professionale, diretto e privo di formalismi. Parla in italiano.

[IMPORTANTE CONTESTO UTENTE GENERALE]
L'utente di questa applicazione è un minorenne. Non percepisce entrate regolari o stipendi fissi. Le sue entrate sono saltuarie e irregolari, costituite principalmente da mance, regali o piccole ricompense per lavoretti occasionali.

[MEMORIA E CONTESTO PERSONALE DELL'UTENTE (DA CONVERSAZIONI PASSATE)]
Ricordi tutto dell'utente, i suoi obiettivi finanziari, preferenze, acquisti pianificati, abitudini e dettagli personali che ha condiviso nelle chat passate:
${userMemoryText ? userMemoryText : 'Nessun dettaglio memorizzato al momento. Man mano che l\'utente chatta con te, ricorda i suoi fatti chiave ed esigenze!'}

Argomenti affrontati nelle chat passate dell'utente:
${pastTopicsText}

[DATI FINANZIARI IN TEMPO REALE]
Hai accesso in tempo reale ai dati finanziari dell'utente per rispondere alle sue domande. Ecco la situazione attuale dell'utente:
- Saldo Totale (Net Worth): €${netWorth.toFixed(2)}
- Dettaglio Portafogli:
${walletDetails}
- Crediti attivi (denaro da riscuotere): €${totalCredits.toFixed(2)}
- Debiti attivi (denaro da pagare): €${totalDebts.toFixed(2)}
${formattedDebtsList ? `- Dettaglio Debiti/Crediti:\n${formattedDebtsList}` : '- Nessun debito o credito attivo.'}
- Transazioni recenti (ultimi 30 giorni):
${formattedTxList || 'Nessuna transazione recente.'}

Usa tutte queste informazioni (sia i dati finanziari che la memoria personale dell'utente) per rispondere in modo preciso, contestualizzato e pratico a tutte le sue domande. Ricorda il contesto delle chat passate quando rispondi. Puoi usare tabelle Markdown quando aiutano a confrontare numeri o categorie in modo più chiaro di un elenco.

[AGGIORNAMENTO MEMORIA UTENTE]
Se l'utente rivela nuovi dettagli personali rilevanti, obiettivi di risparmio specifici, acquisti desiderati o preferenze (es: "voglio risparmiare 200€ entro Natale per una console", "la mia passione è il gaming"), puoi includere a fine risposta un blocco invisibile speciale per aggiornare la sua memoria a lungo termine con la seguente sintassi:
\`\`\`json:memory
{
  "fact": "Descrizione sintetica della nuova informazione od obiettivo dell'utente"
}
\`\`\`

[ABILITÀ GENERAZIONE FILE]
Se l'utente ti chiede di generare, esportare o scaricare un file (es. Excel/XLSX, CSV, PDF, TXT), DEVI rispondere includendo un blocco di codice JSON speciale con questa identica sintassi:
\`\`\`json:export
{
  "type": "csv" | "xlsx" | "txt" | "html",
  "filename": "nome_file.estensione",
  "headers": ["Colonna 1", "Colonna 2", ...],
  "rows": [
    ["Valore A1", "Valore A2", ...],
    ["Valore B1", "Valore B2", ...]
  ]
}
\`\`\`
- Per il formato "xlsx" o "csv", compila la tabella con i dati richiesti.
- Per il formato "txt", inserisci le righe in "rows".
- Per il formato "html" (usato per i PDF), compila "rows" con codice HTML senza virgolette doppie interne.
- Non spiegare il blocco JSON all'utente, rispondi semplicemente confermando la generazione del file.
`

        const history: GroqMessage[] = messages
          .slice(-MAX_HISTORY_MESSAGES)
          .map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))

        const filter = createProtocolBlockFilter()

        for await (const delta of streamGroq({
          system: systemPrompt,
          messages: history,
          temperature: 0.7,
          maxTokens: 4096,
          reasoningEffort: 'low',
        })) {
          for (const safeChunk of filter.feed(delta)) {
            controller.enqueue(encodeEvent({ type: 'delta', text: safeChunk }))
          }
        }
        for (const safeChunk of filter.finish()) {
          controller.enqueue(encodeEvent({ type: 'delta', text: safeChunk }))
        }

        // Post-process the full (unfiltered) text for the invisible memory block.
        const fullText = filter.fullText()
        const memoryRegex = /```json:memory\s*([\s\S]*?)\s*```/g
        let memMatch
        while ((memMatch = memoryRegex.exec(fullText)) !== null) {
          try {
            const memObj = JSON.parse(memMatch[1])
            if (memObj && memObj.fact) {
              const updatedMem = userMemoryText ? `${userMemoryText}\n- ${memObj.fact}` : `- ${memObj.fact}`
              await supabase.from('user_ai_memory').upsert({
                user_id: user.id,
                memory_text: updatedMem,
                updated_at: new Date().toISOString(),
              })
            }
          } catch {
            // Malformed memory block — ignore, nothing to persist.
          }
        }

        controller.enqueue(encodeEvent({ type: 'done', exportBlocks: filter.exportBlocks() }))
      } catch (err) {
        if (err instanceof GroqError) {
          controller.enqueue(encodeEvent({ type: 'error', code: err.code, message: err.message }))
        } else {
          console.error('Error in AI chat stream:', err)
          controller.enqueue(encodeEvent({
            type: 'error',
            code: 'INTERNAL_ERROR',
            message: err instanceof Error ? err.message : 'Errore interno del server',
          }))
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
