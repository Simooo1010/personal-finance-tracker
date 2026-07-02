import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { parseTransaction, getTransactionEffect, getWalletBalances } from '@/lib/transactions'
import { getGCPAuthToken } from '@/lib/gcpAuth'

export async function POST(req: Request) {
  const gcpKeyString = process.env.GCP_SERVICE_ACCOUNT_KEY
  const projectId = process.env.GCP_PROJECT_ID
  
  if (!gcpKeyString || !projectId) {
    return NextResponse.json({ enabled: false }, { status: 200 })
  }

  try {
    const { forceRefresh } = await req.json().catch(() => ({ forceRefresh: false }))

    // 1. Authenticate user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // 2. Check if analysis exists in database to calculate cycles
    const { data: existingAnalysis, error: fetchError } = await supabase
      .from('ai_analysis')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

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

    // 3. Gather data for prompt
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

    // Filter recent transactions (last 30 days) and format them
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentRealTx = transactions
      .filter(t => !t.title.endsWith('-transfer]'))
      .filter(t => new Date(t.created_at) >= thirtyDaysAgo)

    let totalIncome30d = 0
    let totalExpense30d = 0
    recentRealTx.forEach(t => {
      const effect = getTransactionEffect(t, defaultWallet)
      totalIncome30d += effect.income
      totalExpense30d += effect.expense
    })
    const savingsRate30d = totalIncome30d > 0 ? ((totalIncome30d - totalExpense30d) / totalIncome30d) * 100 : 0

    const formattedTxList = recentRealTx.slice(0, 15).map(t => {
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

    // 4. Call Gemini REST API
    const systemPrompt = `Sei un consulente finanziario personale virtuale integrato in un'app di tracciamento spese. Il tuo stile è estremamente minimalista, elegante, amichevole ma diretto, e privo di formalismi inutili. Parla in italiano.

[IMPORTANTE CONTESTO UTENTE]
L'utente di questa applicazione è un minorenne. Non percepisce entrate regolari o stipendi fissi. Le sue entrate sono saltuarie e irregolari, costituite principalmente da mance, regali o piccole ricompense per lavoretti occasionali. Adatta la tua analisi ed i tuoi consigli a questo specifico contesto: non suggerire investimenti complessi o pianificazioni basate su redditi mensili fissi. Concentrati sulla gestione del denaro a breve termine e sull'educazione al risparmio per ragazzi.

Analizza i dati forniti e restituisci un report strutturato esattamente in questi 4 punti (usa solo Markdown semplice, senza saluti o introduzioni verbose):

1. **Stato di Salute Generale**: Valutazione dello stato di salute generale del patrimonio complessivo del ragazzo.
2. **Analisi dei Flussi**: Commento sul tasso di risparmio mensile, valutando la sostenibilità delle spese rispetto alle entrate occasionali registrate.
3. **Punti di Attenzione**: Segnala anomalie (ad esempio, se l'utente sta spendendo troppo da un portafoglio specifico, se un portafoglio sta finendo i fondi, o se ci sono troppi crediti fermi da riscuotere da amici o parenti).
4. **Strategia per la Settimana**: Fornisci 2 o 3 consigli pratici e azionabili per la settimana a venire adattati a un adolescente (es. come dilazionare le piccole spese o ricordare di riscuotere un credito).`

    const userPrompt = `Ecco i dati finanziari correnti dell'utente:
- Saldo Totale (Net Worth): €${netWorth.toFixed(2)}
- Dettaglio Portafogli:
${walletDetails}
- Transazioni degli ultimi 30 giorni (Entrate totali: €${totalIncome30d.toFixed(2)}, Uscite totali: €${totalExpense30d.toFixed(2)}, Tasso di risparmio: ${savingsRate30d.toFixed(1)}%):
${formattedTxList || 'Nessuna transazione recente.'}
- Situazione Debiti/Crediti:
  * Crediti attivi (denaro da riscuotere): €${totalCredits.toFixed(2)}
  * Debiti attivi (denaro da saldare): €${totalDebts.toFixed(2)}
${formattedDebtsList ? `\nElenco dettagliato:\n${formattedDebtsList}` : '\nNessun debito o credito attivo.'}`

    const gcpKey = JSON.parse(gcpKeyString)
    const clientEmail = gcpKey.client_email
    const privateKey = gcpKey.private_key
    const token = await getGCPAuthToken(clientEmail, privateKey)

    // Vertex AI REST API URL
    const vertexUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent`

    const response = await fetch(vertexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: userPrompt }
            ]
          }
        ],
        systemInstruction: {
          parts: [
            { text: systemPrompt }
          ]
        },
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024
        }
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const status = response.status
      if (status === 429 || status === 403) {
        return NextResponse.json({
          error: 'QUOTA_EXCEEDED',
          message: 'Limite di budget o quota API raggiunto. Verifica le impostazioni nella Google Cloud Console.'
        }, { status })
      }
      return NextResponse.json({
        error: 'GEMINI_API_ERROR',
        message: errorData.error?.message || 'Errore nella chiamata API di Gemini'
      }, { status })
    }

    const resData = await response.json()
    const analysisText = resData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!analysisText) {
      return NextResponse.json({ error: 'Nessuna risposta generata da Gemini' }, { status: 500 })
    }

    // 5. Save/Update analysis in database
    let result
    if (existingAnalysis) {
      const isAuto = !forceRefresh
      const updateData: any = {
        analysis_text: analysisText,
        last_generation_time: now.toISOString()
      }
      if (isAuto) {
        updateData.last_auto_generation_time = now.toISOString()
      }

      const { data, error: updateError } = await supabase
        .from('ai_analysis')
        .update(updateData)
        .eq('id', existingAnalysis.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating ai_analysis:', updateError)
        return NextResponse.json({ error: 'Errore nel salvataggio dell\'analisi' }, { status: 500 })
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
        .single()

      if (insertError) {
        console.error('Error inserting ai_analysis:', insertError)
        return NextResponse.json({ error: 'Errore nel salvataggio dell\'analisi iniziale' }, { status: 500 })
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

  } catch (err: any) {
    console.error('Error in AI analysis route:', err)
    return NextResponse.json({ error: 'Errore interno del server', details: err.message }, { status: 500 })
  }
}
