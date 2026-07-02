import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { parseTransaction, getTransactionEffect, getWalletBalances } from '@/lib/transactions'

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ enabled: false }, { status: 200 })
  }

  try {
    const { messages } = await req.json()
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messaggi mancanti o formato non valido' }, { status: 400 })
    }

    // 1. Authenticate user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // 2. Fetch financial context
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

    // 3. System Prompt containing the user's financial situation
    const systemPrompt = `Sei un assistente virtuale di finanza personale integrato nell'app di tracciamento spese dell'utente. Il tuo stile è estremamente minimalista, amichevole ma professionale, diretto e privo di formalismi. Parla in italiano.
    
[IMPORTANTE CONTESTO UTENTE]
L'utente di questa applicazione è un minorenne. Non percepisce entrate regolari o stipendi fissi. Le sue entrate sono saltuarie e irregolari, costituite principalmente da mance, regali o piccole ricompense per lavoretti occasionali.

Hai accesso in tempo reale ai dati finanziari dell'utente per rispondere alle sue domande. Ecco la situazione attuale dell'utente:
- Saldo Totale (Net Worth): €${netWorth.toFixed(2)}
- Dettaglio Portafogli:
${walletDetails}
- Crediti attivi (denaro da riscuotere): €${totalCredits.toFixed(2)}
- Debiti attivi (denaro da pagare): €${totalDebts.toFixed(2)}
${formattedDebtsList ? `- Dettaglio Debiti/Crediti:\n${formattedDebtsList}` : '- Nessun debito o credito attivo.'}
- Transazioni recenti (ultimi 30 giorni):
${formattedTxList || 'Nessuna transazione recente.'}

Usa queste informazioni per rispondere in modo preciso, orientato ai dati e pratico a tutte le domande dell'utente riguardanti la sua situazione economica personale. Cerca di essere conciso ed evita risposte prolisse. Se l'utente ti chiede se può permettersi una determinata spesa, fai una valutazione basata sul suo saldo e sul suo comportamento finanziario recente, tenendo conto del suo contesto da minorenne.`

    // 4. Map frontend message history to Gemini API format
    const contents = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        { text: m.content }
      ]
    }))

    // 5. Call Gemini REST API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [
            { text: systemPrompt }
          ]
        },
        generationConfig: {
          temperature: 0.7,
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
    const replyText = resData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!replyText) {
      return NextResponse.json({ error: 'Nessuna risposta generata da Gemini' }, { status: 500 })
    }

    return NextResponse.json({
      enabled: true,
      reply: replyText
    })

  } catch (err: any) {
    console.error('Error in AI chat route:', err)
    return NextResponse.json({ error: 'Errore interno del server', details: err.message }, { status: 500 })
  }
}
