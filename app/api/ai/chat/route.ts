import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { parseTransaction, getTransactionEffect, getWalletBalances } from '@/lib/transactions'
import { callGroq, GroqError, isGroqConfigured, type GroqMessage } from '@/lib/groq'

/**
 * Groq's free tier is rate limited by tokens-per-minute, so only the tail of a
 * long conversation is replayed to the model on each turn.
 */
const MAX_HISTORY_MESSAGES = 20

export async function POST(req: Request) {
  if (!isGroqConfigured()) {
    return NextResponse.json({ enabled: false }, { status: 200 })
  }

  try {
    const { messages, sessionId } = await req.json()
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messaggi mancanti o formato non valido' }, { status: 400 })
    }

    // 1. Authenticate user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // 2. Fetch User Long-Term AI Memory & Past Sessions Summary
    const { data: memoryData } = await supabase
      .from('user_ai_memory')
      .select('memory_text')
      .eq('user_id', user.id)
      .maybeSingle()

    const userMemoryText = memoryData?.memory_text || ''

    // Fetch past chat session titles for additional context
    const { data: pastSessions } = await supabase
      .from('chat_sessions')
      .select('id, title, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(10)

    const pastTopicsText = pastSessions && pastSessions.length > 0
      ? pastSessions.map(s => `- ${s.title}`).join('\n')
      : 'Nessuna conversazione precedente.'

    // 3. Fetch financial context
    // Fetch wallets
    const { data: wallets, error: walletsError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .order('position')
    if (walletsError || !wallets) {
      return NextResponse.json({ error: 'Errore nel caricamento dei portafogli' }, { status: 500 })
    }

    // Fetch transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (txError || !transactions) {
      return NextResponse.json({ error: 'Errore nel caricamento delle transazioni' }, { status: 500 })
    }

    const defaultWallet = wallets.find(w => w.position === 0)?.slug || 'generale'
    const walletSlugs = wallets.map(w => w.slug)
    const walletMap = wallets.reduce((acc, w) => {
      acc[w.slug] = w.name
      return acc
    }, {} as Record<string, string>)

    // Calculate balances
    const balances = getWalletBalances(transactions, walletSlugs, defaultWallet)
    let netWorth = Object.values(balances).reduce((sum, bal) => sum + bal, 0)

    // Format wallets
    const walletDetails = wallets.map(w => {
      return `- ${w.name}: €${(balances[w.slug] || 0).toFixed(2)}`
    }).join('\n')

    // Filter recent transactions (last 30 days) and format them
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

    // Filter debts
    const debtsList = transactions
      .map(t => {
        const parsed = parseTransaction(t, defaultWallet)
        return {
          amount: Number(t.amount),
          ...parsed
        }
      })
      .filter(item => item.isDebt && item.debtInfo !== null)

    const activeCredits = debtsList.filter(d => d.debtInfo?.type === 'to_me' && d.debtInfo.status === 'active')
    const totalCredits = activeCredits.reduce((s, c) => s + c.amount, 0)

    const activeDebts = debtsList.filter(d => d.debtInfo?.type === 'by_me' && d.debtInfo.status === 'active')
    const totalDebts = activeDebts.reduce((s, d) => s + d.amount, 0)

    const formattedDebtsList = debtsList
      .filter(d => d.debtInfo?.status === 'active')
      .map(d => `- ${d.debtInfo?.type === 'to_me' ? 'Credito da' : 'Debito verso'} ${d.debtInfo?.person}: "${d.debtInfo?.desc}" (€${d.amount.toFixed(2)})`)
      .join('\n')

    // 4. Build System Prompt with financial data AND long-term user memory
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

Usa tutte queste informazioni (sia i dati finanziari che la memoria personale dell'utente) per rispondere in modo preciso, contestualizzato e pratico a tutte le sue domande. Ricorda il contesto delle chat passate quando rispondi.

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

    // 5. Map frontend message history to the Groq chat format
    const history: GroqMessage[] = messages
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }))

    let replyText: string
    try {
      replyText = await callGroq({
        system: systemPrompt,
        messages: history,
        temperature: 0.7,
        maxTokens: 4096,
        reasoningEffort: 'low'
      })
    } catch (groqErr) {
      if (groqErr instanceof GroqError) {
        return NextResponse.json(
          { error: groqErr.code, message: groqErr.message },
          { status: groqErr.status }
        )
      }
      throw groqErr
    }

    // Check if memory block was emitted to auto-update user_ai_memory
    const memoryRegex = /```json:memory\s*([\s\S]*?)\s*```/g
    let memMatch
    while ((memMatch = memoryRegex.exec(replyText)) !== null) {
      try {
        const memObj = JSON.parse(memMatch[1])
        if (memObj && memObj.fact) {
          const updatedMem = userMemoryText
            ? `${userMemoryText}\n- ${memObj.fact}`
            : `- ${memObj.fact}`

          await supabase.from('user_ai_memory').upsert({
            user_id: user.id,
            memory_text: updatedMem,
            updated_at: new Date().toISOString()
          })
        }
      } catch (e) {
        console.error("Failed to parse memory update JSON:", e)
      }
    }

    // Strip memory block from replyText if present so user doesn't see raw block
    replyText = replyText.replace(/```json:memory[\s\S]*?```/g, '').trim()

    // 6. Handle session titles & update updated_at timestamp
    let currentSessionId = sessionId
    let sessionTitle = 'Nuova chat'

    const userFirstMsg = messages.find(m => m.role === 'user')?.content || 'Nuova chat'
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
          .update({
            title: sessionTitle,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentSessionId)
      }
    } else {
      // Create new session
      const { data: newSession, error: newSessErr } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          title: generatedTitle,
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (!newSessErr && newSession) {
        currentSessionId = newSession.id
        sessionTitle = newSession.title
      }
    }

    return NextResponse.json({
      enabled: true,
      reply: replyText,
      sessionId: currentSessionId,
      sessionTitle
    })

  } catch (err: any) {
    console.error('Error in AI chat route:', err)
    return NextResponse.json({ error: 'Errore interno del server', details: err.message }, { status: 500 })
  }
}
