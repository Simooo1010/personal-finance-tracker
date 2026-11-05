import { NextResponse } from 'next/server'
import { z } from 'zod'
import { acquireAiRequest, aiErrorResponse, AiRequestError, aiRequestSignal, authorizeAiRequest } from '@/lib/ai-request'
import { parseTransaction, getTransactionEffect, getWalletBalances } from '@/lib/transactions'
import { callGroq, GroqError } from '@/lib/groq'

const analysisInput = z.object({ forceRefresh: z.boolean().optional() }).strict()

export async function POST(req: Request) {
  const signal = aiRequestSignal(req.signal)
  let release: (() => void) | undefined
  try {
    const auth = await authorizeAiRequest(req, analysisInput, 4096, signal)
    if (auth instanceof Response) return auth
    const { supabase, user, input: { forceRefresh } } = auth
    release = acquireAiRequest('analysis', user.id, 'refresh').release

    // 2. Check if analysis exists in database to calculate cycles
    const { data: existingAnalysis, error: fetchError } = await supabase
      .from('ai_analysis')
      .select('*')
      .eq('user_id', user.id)
      .abortSignal(signal)
      .maybeSingle()
    signal.throwIfAborted()
    if (fetchError) throw new AiRequestError(500, 'Errore nel caricamento dell\'analisi')

    const now = new Date()

    if (existingAnalysis && !forceRefresh) {
      const firstGen = new Date(existingAnalysis.first_generation_time)
      const lastAuto = new Date(existingAnalysis.last_auto_generation_time)

      // Calculate weeks elapsed
      const msPerWeek = 7 * 24 * 60 * 60 * 1000
      const weeksSinceStart = Math.floor((now.getTime() - firstGen.getTime()) / msPerWeek)
      const weeksAtLastAuto = Math.floor((lastAuto.getTime() - firstGen.getTime()) / msPerWeek)

      // If we haven't crossed into a new week cycle, return cached analysis
      if (weeksSinceStart <= weeksAtLastAuto) {
        return NextResponse.json({
          enabled: true,
          first_generation_time: existingAnalysis.first_generation_time,
          last_generation_time: existingAnalysis.last_generation_time,
          last_auto_generation_time: existingAnalysis.last_auto_generation_time,
          analysis_text: existingAnalysis.analysis_text
        })
      }
    }

    // 3. Gather User Long-Term AI Memory & Chat History Context
    const { data: memoryData } = await supabase
      .from('user_ai_memory')
      .select('memory_text')
      .eq('user_id', user.id)
      .abortSignal(signal)
      .maybeSingle()

    const userMemoryText = memoryData?.memory_text || ''

    const { data: chatSessions } = await supabase
      .from('chat_sessions')
      .select('title')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(10)
      .abortSignal(signal)

    const pastTopicsText = chatSessions && chatSessions.length > 0
      ? chatSessions.map(s => `- ${s.title}`).join('\n')
      : 'Nessuna conversazione recente.'

    // 4. Gather financial data for prompt
    // Fetch wallets
    const { data: wallets, error: walletsError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .order('position')
      .abortSignal(signal)
    signal.throwIfAborted()
    if (walletsError || !wallets) {
      return NextResponse.json({ error: 'Errore nel caricamento dei portafogli' }, { status: 500 })
    }

    // Fetch transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .abortSignal(signal)
    signal.throwIfAborted()
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
    const netWorth = Object.values(balances).reduce((sum, bal) => sum + bal, 0)

    // Filter recent transactions (last 30 days and last 7 days) and format them
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const recentRealTx = transactions
      .filter(t => !t.title.endsWith('-transfer]'))
      .filter(t => new Date(t.created_at) >= thirtyDaysAgo)

    const weeklyRealTx = recentRealTx.filter(t => new Date(t.created_at) >= sevenDaysAgo)

    let totalIncome30d = 0
    let totalExpense30d = 0
    recentRealTx.forEach(t => {
      const effect = getTransactionEffect(t, defaultWallet)
      totalIncome30d += effect.income
      totalExpense30d += effect.expense
    })
    const savingsRate30d = totalIncome30d > 0 ? ((totalIncome30d - totalExpense30d) / totalIncome30d) * 100 : 0

    let totalIncome7d = 0
    let totalExpense7d = 0
    weeklyRealTx.forEach(t => {
      const effect = getTransactionEffect(t, defaultWallet)
      totalIncome7d += effect.income
      totalExpense7d += effect.expense
    })
    const savingsRate7d = totalIncome7d > 0 ? ((totalIncome7d - totalExpense7d) / totalIncome7d) * 100 : 0

    const formattedTxList30d = recentRealTx.slice(0, 15).map(t => {
      const parsed = parseTransaction(t, defaultWallet)
      const date = new Date(t.created_at).toLocaleDateString('it-IT')
      return `- [${date}] ${t.type === 'income' ? 'Entrata' : 'Uscita'} su [${walletMap[parsed.wallet] || parsed.wallet}]: "${parsed.cleanTitle}" (€${Number(t.amount).toFixed(2)})`
    }).join('\n')

    const formattedTxList7d = weeklyRealTx.map(t => {
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

    const walletDetails = wallets.map(w => {
      return `- ${w.name}: €${(balances[w.slug] || 0).toFixed(2)} (${w.description || 'Nessuna descrizione'})`
    }).join('\n')

    // 5. Call Groq with financial data AND long-term user memory
    const systemPrompt = `Sei un consulente finanziario personale virtuale di livello avanzato integrato in un'app di tracciamento spese per adolescenti. Il tuo stile è estremamente minimalista, elegante, amichevole ma diretto, e privo di formalismi inutili. Parla in italiano.

[IMPORTANTE CONTESTO UTENTE]
L'utente di questa applicazione è un minorenne. Le sue entrate sono occasionali e irregolari (mance, regali, lavoretti). Adatta tutti i tuoi consigli a questo specifico contesto. Concentrati sulla gestione pratica del denaro e sull'educazione al risparmio per ragazzi.

[MEMORIA E CONTESTO PERSONALE DELL'UTENTE (ACQUISITI DALLE CHAT PASSATE)]
Usa anche la memoria e i fatti personali emersi nelle chat dell'utente per personalizzare il report (es. suoi obiettivi di risparmio, desideri d'acquisto, interessi o abitudini menzionate):
${userMemoryText ? userMemoryText : 'Nessun dettaglio specifico registrato nelle chat.'}

Temi recenti discussi in chat dall'utente:
${pastTopicsText}

Analizza i dati forniti e la memoria dell'utente e restituisci un report strutturato esattamente in questi 5 punti (usa Markdown elegante: titoli, grassetto, elenchi puntati e numerati; usa anche una tabella Markdown quando aiuta a confrontare numeri o categorie in modo più chiaro di un elenco). Nessun saluto o introduzione verbosa:

1. **Stato di Salute e Risparmio**: Valutazione dello stato economico complessivo. Commenta il saldo totale e metti a confronto il tasso di risparmio degli ultimi 7 giorni con quello degli ultimi 30 giorni per evidenziare se il trend settimanale è in miglioramento o peggioramento.
2. **Analisi delle Spese Settimanali**: Un esame approfondito di DOVE sono andati i soldi negli ultimi 7 giorni. Raggruppa le spese per categoria o scopo e indica chiaramente quali voci o acquisti specifici hanno inciso di più.
3. **Opportunità di Risparmio e Cambiamenti**: Identifica comportamenti da correggere e suggerisci modifiche concrete (tenendo conto degli obiettivi personali dell'utente se presenti nella sua memoria).
4. **Piano d'Azione per la Settimana**: Fornisci da 2 a 4 suggerimenti pratici, realistici e personalizzati per i prossimi giorni.
5. **L'Angolo del Guru (Spazio Libero & Creativo)**: In questa sezione hai totale libertà e autonomia creativa. Trova un angolo di analisi unico, profondo o inaspettato basato sui dati e sulla memoria dell'utente. Stupisci l'utente con una riflessione acuta, intelligente o di grande ispirazione.`

    const userPrompt = `Ecco i dati finanziari correnti dell'utente:
- Saldo Totale (Net Worth): €${netWorth.toFixed(2)}
- Dettaglio Portafogli:
${walletDetails}

[DATI DEGLI ULTIMI 7 GIORNI (QUESTA SETTIMANA)]
- Entrate settimanali: €${totalIncome7d.toFixed(2)}
- Uscite settimanali: €${totalExpense7d.toFixed(2)}
- Tasso di risparmio settimanale: ${savingsRate7d.toFixed(1)}%
- Transazioni della settimana:
${formattedTxList7d || 'Nessuna transazione registrata questa settimana.'}

[DATI DEGLI ULTIMI 30 GIORNI]
- Entrate mensili: €${totalIncome30d.toFixed(2)}
- Uscite mensili: €${totalExpense30d.toFixed(2)}
- Tasso di risparmio mensile: ${savingsRate30d.toFixed(1)}%
- Transazioni degli ultimi 30 giorni (max 15 mostrate):
${formattedTxList30d || 'Nessuna transazione recente negli ultimi 30 giorni.'}

- Situazione Debiti/Crediti:
  * Crediti attivi (denaro da riscuotere): €${totalCredits.toFixed(2)}
  * Debiti attivi (denaro da saldare): €${totalDebts.toFixed(2)}
${formattedDebtsList ? `\nElenco dettagliato:\n${formattedDebtsList}` : '\nNessun debito o credito attivo.'}`

    const analysisText = await callGroq({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.2,
      maxTokens: 4096,
      reasoningEffort: 'medium',
      signal,
    })

    // 6. Save/Update analysis in database
    signal.throwIfAborted()
    let result
    if (existingAnalysis) {
      const updateData = {
        analysis_text: analysisText,
        last_generation_time: now.toISOString(),
        ...(!forceRefresh ? { last_auto_generation_time: now.toISOString() } : {}),
      }

      const { data, error: updateError } = await supabase
        .from('ai_analysis')
        .update(updateData)
        .eq('id', existingAnalysis.id)
        .eq('user_id', user.id)
        .eq('last_generation_time', existingAnalysis.last_generation_time)
        .select()
        .abortSignal(signal)
        .maybeSingle()

      signal.throwIfAborted()
      if (updateError) {
        throw new AiRequestError(500, 'Errore nel salvataggio dell\'analisi')
      }
      if (!data) {
        throw new AiRequestError(409, 'Analisi aggiornata da un’altra richiesta. Riprova.')
      }
      result = data
    } else {
      // First generation
      const { data, error: insertError } = await supabase
        .from('ai_analysis')
        .insert({
          user_id: user.id,
          first_generation_time: now.toISOString(),
          last_generation_time: now.toISOString(),
          last_auto_generation_time: now.toISOString(),
          analysis_text: analysisText
        })
        .select()
        .abortSignal(signal)
        .single()

      signal.throwIfAborted()
      if (insertError?.code === '23505') {
        throw new AiRequestError(409, 'Analisi aggiornata da un’altra richiesta. Riprova.')
      }
      if (insertError || !data) {
        throw new AiRequestError(500, 'Errore nel salvataggio dell\'analisi iniziale')
      }
      result = data
    }

    return NextResponse.json({
      enabled: true,
      first_generation_time: result.first_generation_time,
      last_generation_time: result.last_generation_time,
      last_auto_generation_time: result.last_auto_generation_time,
      analysis_text: result.analysis_text
    })

  } catch (err) {
    if (!signal.aborted && err instanceof GroqError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status })
    }
    return aiErrorResponse(err, signal)
  } finally {
    release?.()
  }
}
