import { z } from 'zod'
import { MAX_CHAT_BODY_BYTES, MAX_CHAT_MESSAGES, MAX_CHAT_MESSAGE_LENGTH } from '@/lib/ai-chat-limits'
import { acquireAiRequest, aiAbortError, aiErrorResponse, AiRequestError, aiRequestSignal, authorizeAiRequest } from '@/lib/ai-request'
import { parseTransaction, getWalletBalances } from '@/lib/transactions'
import { streamGroq, GroqError } from '@/lib/groq'
import type { createClient } from '@/lib/supabaseServer'

const chatInput = z.object({
  sessionId: z.string().uuid().nullish(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(MAX_CHAT_MESSAGE_LENGTH).refine(content => Boolean(content.trim())),
  }).strict()).min(1).max(MAX_CHAT_MESSAGES).refine(messages => messages.at(-1)?.role === 'user'),
}).strict()

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
 * Suppress protocol fences in regular chat text. Model-supplied `json:memory`
 * is discarded. `json:export` still needs to reach the client
 * (to render as a download card and be persisted for reloads), so
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
    exportBlocks(): string[] {
      return exportBlocks
    },
  }
}

export async function POST(req: Request) {
  const streamAbort = new AbortController()
  const signal = aiRequestSignal(req.signal, streamAbort.signal)
  let release: (() => void) | undefined
  try {
    const auth = await authorizeAiRequest(req, chatInput, MAX_CHAT_BODY_BYTES, signal)
    if (auth instanceof Response) return auth
    const { supabase, user, input: { messages, sessionId } } = auth
    const reservation = acquireAiRequest('chat', user.id, sessionId?.toLowerCase() ?? 'new', 2)
    release = reservation.release

    // The session event lets clients keep streaming if the user switches chats.
    let currentSessionId: string
    let sessionTitle: string
    const userFirstMsg = messages.find(message => message.role === 'user')?.content ?? 'Nuova chat'
    const generatedTitle = userFirstMsg.length > 35 ? `${userFirstMsg.slice(0, 35)}...` : userFirstMsg

    if (sessionId) {
      const { data: existingSession, error } = await supabase
        .from('chat_sessions')
        .select('id, title')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .abortSignal(signal)
        .maybeSingle()
      if (error) throw new AiRequestError(500, 'Errore nel caricamento della chat')
      if (!existingSession) throw new AiRequestError(404, 'Conversazione non trovata')

      currentSessionId = existingSession.id
      sessionTitle = existingSession.title === 'Nuova chat' ? generatedTitle : existingSession.title
      signal.throwIfAborted()
      const { data: savedSession, error: saveError } = await supabase
        .from('chat_sessions')
        .update({ title: sessionTitle, updated_at: new Date().toISOString() })
        .eq('id', currentSessionId)
        .eq('user_id', user.id)
        .select('id')
        .abortSignal(signal)
        .single()
      if (saveError || !savedSession) throw new AiRequestError(500, 'Errore nel salvataggio della chat')
    } else {
      signal.throwIfAborted()
      const { data: newSession, error } = await supabase
        .from('chat_sessions')
        .insert({ user_id: user.id, title: generatedTitle, updated_at: new Date().toISOString() })
        .select('id, title')
        .abortSignal(signal)
        .single()
      if (error || !newSession) throw new AiRequestError(500, 'Errore nella creazione della chat')
      currentSessionId = newSession.id
      sessionTitle = newSession.title
      reservation.addKey(currentSessionId.toLowerCase())
    }

    signal.throwIfAborted()
    const stream = createChatStream({
      supabase, userId: user.id, messages, currentSessionId, sessionTitle, signal, streamAbort, release,
    })
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })

  } catch (error) {
    release?.()
    return aiErrorResponse(error, signal)
  }
}

function createChatStream({
  supabase, userId, messages, currentSessionId, sessionTitle, signal, streamAbort, release,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  messages: z.infer<typeof chatInput>['messages']
  currentSessionId: string
  sessionTitle: string
  signal: AbortSignal
  streamAbort: AbortController
  release: () => void
}) {
  let cancelled = false
  return new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true
      streamAbort.abort()
    },
    async start(controller) {
      try {
        controller.enqueue(encodeEvent({ type: 'session', sessionId: currentSessionId, sessionTitle }))
        // Fetch long-term memory & past session titles
        const { data: memoryData } = await supabase
          .from('user_ai_memory')
          .select('memory_text')
          .eq('user_id', userId)
          .abortSignal(signal)
          .maybeSingle()
        const userMemoryText = memoryData?.memory_text || ''

        const { data: pastSessions } = await supabase
          .from('chat_sessions')
          .select('id, title, updated_at')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(10)
          .abortSignal(signal)
        const pastTopicsText = pastSessions && pastSessions.length > 0
          ? pastSessions.map(s => `- ${s.title}`).join('\n')
          : 'Nessuna conversazione precedente.'

        // Fetch financial context
        const { data: wallets, error: walletsError } = await supabase
          .from('wallets')
          .select('*')
          .eq('user_id', userId)
          .order('position')
          .abortSignal(signal)
        if (walletsError || !wallets) throw new AiRequestError(500, 'Errore nel caricamento dei portafogli')

        const { data: transactions, error: txError } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .abortSignal(signal)
        if (txError || !transactions) throw new AiRequestError(500, 'Errore nel caricamento delle transazioni')

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
${userMemoryText || 'Nessun dettaglio memorizzato al momento.'}

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

[ABILITÀ GENERAZIONE FILE]
Se l'utente ti chiede di generare, esportare o scaricare un file, includi un blocco di codice JSON speciale con questa sintassi:
\`\`\`json:export
{
  "type": "csv" | "txt" | "html",
  "filename": "nome_file.estensione",
  "headers": ["Colonna 1", "Colonna 2", ...],
  "rows": [
    ["Valore A1", "Valore A2", ...],
    ["Valore B1", "Valore B2", ...]
  ]
}
\`\`\`
- Per un foglio di calcolo, usa "csv" e l'estensione .csv. Descrivilo come CSV, apribile in Excel.
- Per il formato "txt", inserisci le righe di testo in "rows".
- Per un documento da stampare o salvare come PDF, usa "html" e l'estensione .html. Fornisci celle di testo, numeri, booleani o null in "rows" e intestazioni opzionali in "headers". Evita tag HTML. Indica di aprire il file e usare Stampa / Salva come PDF.
- Conferma all'utente il formato del file generato senza spiegare il blocco JSON.
`

        const filter = createProtocolBlockFilter()

        for await (const delta of streamGroq({
          system: systemPrompt,
          messages,
          temperature: 0.7,
          maxTokens: 4096,
          reasoningEffort: 'low',
          signal,
        })) {
          signal.throwIfAborted()
          for (const safeChunk of filter.feed(delta)) {
            controller.enqueue(encodeEvent({ type: 'delta', text: safeChunk }))
          }
        }
        for (const safeChunk of filter.finish()) {
          controller.enqueue(encodeEvent({ type: 'delta', text: safeChunk }))
        }

        signal.throwIfAborted()
        controller.enqueue(encodeEvent({ type: 'done', exportBlocks: filter.exportBlocks() }))
      } catch (err) {
        if (cancelled) return
        const abort = aiAbortError(signal)
        if (abort) {
          controller.enqueue(encodeEvent({
            type: 'error',
            code: abort.status === 504 ? 'TIMEOUT' : 'CANCELLED',
            message: abort.message,
          }))
        } else if (err instanceof GroqError) {
          controller.enqueue(encodeEvent({ type: 'error', code: err.code, message: err.message }))
        } else {
          controller.enqueue(encodeEvent({
            type: 'error',
            code: 'INTERNAL_ERROR',
            message: err instanceof AiRequestError ? err.message : 'Errore interno del server',
          }))
        }
      } finally {
        release()
        if (!cancelled) controller.close()
      }
    },
  })
}
