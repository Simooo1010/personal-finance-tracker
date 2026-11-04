import { formatDebtTitle, getWalletBalances, parseTransaction } from '@/lib/transactions'
import {
  aiActionRequestSchema,
  isValidProposalDate,
  transactionRowSchema,
  walletRowSchema,
  type AIActionRequest,
  type PreparedAIAction,
} from '@/lib/aiActionSchema'
import type { Transaction } from '@/lib/supabase'
import type { Wallet } from '@/lib/wallets'

function preview(title: string, fields: Array<{ label: string; before?: string | null; after?: string | null }>, warning: string | null = null) {
  return { title, fields: fields.map(field => ({ label: field.label, before: field.before ?? null, after: field.after ?? null })), warning }
}

function normalizeTransaction(transaction: Transaction) {
  return transactionRowSchema.parse({ id: transaction.id, title: transaction.title, amount: Number(transaction.amount), type: transaction.type, created_at: transaction.created_at })
}

function normalizeWallet(wallet: Wallet) {
  return walletRowSchema.parse({ id: wallet.id, slug: wallet.slug, name: wallet.name, description: wallet.description, position: wallet.position })
}

function findTransaction(transactions: Transaction[], id: string) {
  const found = transactions.find(transaction => transaction.id === id)
  if (!found) throw new Error('Non trovo più il movimento selezionato. Ricarica i dati e riprova.')
  return found
}

function findWallet(wallets: Wallet[], id: string) {
  const found = wallets.find(wallet => wallet.id === id)
  if (!found) throw new Error('Non trovo più il portafoglio selezionato. Ricarica i dati e riprova.')
  return found
}

function walletBySlug(wallets: Wallet[], value: string) {
  const found = wallets.find(wallet => wallet.slug === value)
  if (!found) throw new Error(`Il portafoglio “${value}” non esiste. Scegli un portafoglio presente nell'elenco.`)
  return found
}

function dateAtNoon(date: string) {
  if (!isValidProposalDate(date)) throw new Error('La data proposta non è valida.')
  return new Date(`${date}T12:00:00.000Z`).toISOString()
}

function dateWithExistingTime(date: string, currentDate: string) {
  if (!isValidProposalDate(date)) throw new Error('La data proposta non è valida.')
  const current = new Date(currentDate)
  const selected = new Date(`${date}T00:00:00.000Z`)
  selected.setUTCHours(current.getUTCHours(), current.getUTCMinutes(), current.getUTCSeconds(), current.getUTCMilliseconds())
  return selected.toISOString()
}

function transactionTitle(description: string, wallet: string) {
  const clean = description.trim()
  return `${clean} [${wallet}]`
}

function findTransferPair(source: Transaction, transactions: Transaction[], defaultWallet: string) {
  if (source.type !== 'expense' || !source.title.endsWith('-transfer]')) {
    throw new Error('Non riesco a identificare il trasferimento. Chiedi un chiarimento prima di modificarlo.')
  }
  const sourceBase = source.title.replace(/\s+\[[a-zA-Z0-9_-]+-transfer\]$/, '')
  const matches = transactions.filter(candidate =>
    candidate.id !== source.id &&
    candidate.type === 'income' &&
    candidate.title.endsWith('-transfer]') &&
    candidate.title.replace(/\s+\[[a-zA-Z0-9_-]+-transfer\]$/, '') === sourceBase &&
    Number(candidate.amount) === Number(source.amount) &&
    new Date(candidate.created_at).getTime() === new Date(source.created_at).getTime() &&
    parseTransaction(candidate, defaultWallet).wallet !== parseTransaction(source, defaultWallet).wallet,
  )
  if (matches.length !== 1) throw new Error('Il trasferimento ha più movimenti compatibili o una controparte mancante. Specifica quale trasferimento intendi.')
  return matches[0]
}

export function slugifyWalletName(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
}

export function prepareAIAction(
  rawAction: unknown,
  context: { wallets: Wallet[]; transactions: Transaction[]; defaultWallet: string; memoryText: string },
): PreparedAIAction {
  const action = aiActionRequestSchema.parse(rawAction) as AIActionRequest
  const { wallets, transactions, defaultWallet } = context

  if (action.type === 'transaction.create') {
    const wallet = walletBySlug(wallets, action.wallet)
    const record = { title: transactionTitle(action.description, wallet.slug), amount: action.amount, type: action.direction, created_at: dateAtNoon(action.date) }
    return {
      kind: action.type,
      command: { operation: 'transactions.insert', records: [record] },
      preview: preview('Crea transazione', [
        { label: 'Descrizione', after: action.description },
        { label: 'Tipo', after: action.direction === 'income' ? 'Entrata' : 'Uscita' },
        { label: 'Importo', after: `€${action.amount.toFixed(2)}` },
        { label: 'Data', after: action.date },
        { label: 'Portafoglio', after: wallet.name },
      ]),
    }
  }

  if (action.type === 'transaction.update') {
    const current = findTransaction(transactions, action.transactionId)
    const parsed = parseTransaction(current, defaultWallet)
    if (parsed.isDebt || current.title.endsWith('-transfer]')) throw new Error('Questo movimento appartiene a un debito o a un trasferimento. Usa l’azione specifica per quel tipo di dato.')
    const currentWallet = walletBySlug(wallets, parsed.wallet)
    const wallet = action.changes.wallet ? walletBySlug(wallets, action.changes.wallet) : currentWallet
    const nextDescription = action.changes.description ?? parsed.cleanTitle
    const after = {
      ...normalizeTransaction(current),
      title: transactionTitle(nextDescription, wallet.slug),
      amount: action.changes.amount ?? Number(current.amount),
      type: action.changes.direction ?? current.type,
      created_at: action.changes.date ? dateWithExistingTime(action.changes.date, current.created_at) : current.created_at,
    }
    const before = normalizeTransaction(current)
    const fields: Array<{ label: string; before: string | null; after: string | null }> = [{ label: 'Transazione', before: null, after: `${parsed.cleanTitle} · ${currentWallet.name} · ${current.created_at.slice(0, 10)}` }]
    if (before.title !== after.title) fields.push({ label: 'Descrizione / portafoglio', before: `${parsed.cleanTitle} · ${currentWallet.name}`, after: `${nextDescription} · ${wallet.name}` })
    if (before.amount !== after.amount) fields.push({ label: 'Importo', before: `€${before.amount.toFixed(2)}`, after: `€${after.amount.toFixed(2)}` })
    if (before.type !== after.type) fields.push({ label: 'Tipo', before: before.type === 'income' ? 'Entrata' : 'Uscita', after: after.type === 'income' ? 'Entrata' : 'Uscita' })
    if (before.created_at !== after.created_at) fields.push({ label: 'Data', before: before.created_at.slice(0, 10), after: after.created_at.slice(0, 10) })
    return { kind: action.type, command: { operation: 'transactions.update', before: [before], after: [after] }, preview: preview('Modifica transazione', fields) }
  }

  if (action.type === 'transaction.delete') {
    const current = findTransaction(transactions, action.transactionId)
    const parsed = parseTransaction(current, defaultWallet)
    if (parsed.isDebt || current.title.endsWith('-transfer]')) throw new Error('Questo movimento appartiene a un debito o a un trasferimento. Usa l’azione specifica per quel tipo di dato.')
    const wallet = walletBySlug(wallets, parsed.wallet)
    return {
      kind: action.type,
      command: { operation: 'transactions.delete', before: [normalizeTransaction(current)] },
      preview: preview('Elimina transazione', [
        { label: 'Descrizione', before: parsed.cleanTitle },
        { label: 'Importo', before: `€${Number(current.amount).toFixed(2)}` },
        { label: 'Tipo', before: current.type === 'income' ? 'Entrata' : 'Uscita' },
        { label: 'Data', before: current.created_at.slice(0, 10) },
        { label: 'Portafoglio', before: wallet.name },
      ], 'Questa transazione verrà eliminata definitivamente.'),
    }
  }

  if (action.type === 'debt.create') {
    const wallet = walletBySlug(wallets, action.wallet)
    const record = {
      title: formatDebtTitle({ type: action.debtType, person: action.person, desc: action.description, status: 'active' }, wallet.slug),
      amount: action.amount,
      type: action.debtType === 'to_me' ? 'expense' as const : 'income' as const,
      created_at: dateAtNoon(action.date),
    }
    return {
      kind: action.type,
      command: { operation: 'transactions.insert', records: [record] },
      preview: preview('Crea debito / credito', [
        { label: 'Persona', after: action.person },
        { label: 'Descrizione', after: action.description },
        { label: 'Tipo', after: action.debtType === 'to_me' ? 'Credito da riscuotere' : 'Debito da pagare' },
        { label: 'Importo', after: `€${action.amount.toFixed(2)}` },
        { label: 'Data', after: action.date },
        { label: 'Portafoglio', after: wallet.name },
      ]),
    }
  }

  if (action.type === 'debt.update' || action.type === 'debt.set_status' || action.type === 'debt.delete') {
    const current = findTransaction(transactions, action.transactionId)
    const parsed = parseTransaction(current, defaultWallet)
    if (!parsed.isDebt || !parsed.debtInfo) throw new Error('Non trovo un debito o credito con quei dettagli.')
    const before = normalizeTransaction(current)
    if (action.type === 'debt.delete') {
      return {
        kind: action.type,
        command: { operation: 'transactions.delete', before: [before] },
        preview: preview('Elimina debito / credito', [
          { label: 'Persona', before: parsed.debtInfo.person },
          { label: 'Descrizione', before: parsed.debtInfo.desc },
          { label: 'Importo', before: `€${Number(current.amount).toFixed(2)}` },
          { label: 'Stato', before: parsed.debtInfo.status === 'active' ? 'Attivo' : 'Completato' },
        ], 'Questo debito o credito verrà eliminato definitivamente.'),
      }
    }
    const changes = action.type === 'debt.set_status' ? { status: action.status } : action.changes
    const nextDebt = { ...parsed.debtInfo, person: changes.person ?? parsed.debtInfo.person, desc: changes.description ?? parsed.debtInfo.desc, type: changes.debtType ?? parsed.debtInfo.type, status: changes.status ?? parsed.debtInfo.status }
    const wallet = changes.wallet ? walletBySlug(wallets, changes.wallet) : walletBySlug(wallets, parsed.wallet)
    const after = {
      ...before,
      title: formatDebtTitle(nextDebt, wallet.slug),
      amount: changes.amount ?? Number(current.amount),
      type: nextDebt.type === 'to_me' ? 'expense' as const : 'income' as const,
      created_at: changes.date ? dateWithExistingTime(changes.date, current.created_at) : current.created_at,
    }
    const fields = []
    const oldWallet = walletBySlug(wallets, parsed.wallet)
    if (parsed.debtInfo.person !== nextDebt.person) fields.push({ label: 'Persona', before: parsed.debtInfo.person, after: nextDebt.person })
    if (parsed.debtInfo.desc !== nextDebt.desc) fields.push({ label: 'Descrizione', before: parsed.debtInfo.desc, after: nextDebt.desc })
    if (parsed.debtInfo.type !== nextDebt.type) fields.push({ label: 'Tipo', before: parsed.debtInfo.type === 'to_me' ? 'Credito da riscuotere' : 'Debito da pagare', after: nextDebt.type === 'to_me' ? 'Credito da riscuotere' : 'Debito da pagare' })
    if (Number(current.amount) !== after.amount) fields.push({ label: 'Importo', before: `€${Number(current.amount).toFixed(2)}`, after: `€${after.amount.toFixed(2)}` })
    if (parsed.debtInfo.status !== nextDebt.status) fields.push({ label: 'Stato', before: parsed.debtInfo.status === 'active' ? 'Attivo' : 'Completato', after: nextDebt.status === 'active' ? 'Attivo' : 'Completato' })
    if (parsed.wallet !== wallet.slug) fields.push({ label: 'Portafoglio', before: oldWallet.name, after: wallet.name })
    if (before.created_at !== after.created_at) fields.push({ label: 'Data', before: before.created_at.slice(0, 10), after: after.created_at.slice(0, 10) })
    return {
      kind: action.type,
      command: { operation: 'transactions.update', before: [before], after: [after] },
      preview: preview(action.type === 'debt.set_status' ? 'Aggiorna stato debito / credito' : 'Modifica debito / credito', fields),
    }
  }

  if (action.type === 'transfer.create') {
    const source = walletBySlug(wallets, action.sourceWallet)
    const destination = walletBySlug(wallets, action.destinationWallet)
    if (source.slug === destination.slug) throw new Error('Scegli due portafogli diversi per il trasferimento.')
    const when = dateAtNoon(action.date)
    const name = action.description?.trim() || `Spostamento ${source.name} ➔ ${destination.name}`
    const records = [
      { title: `${name} [${source.slug}-transfer]`, amount: action.amount, type: 'expense' as const, created_at: when },
      { title: `${name} [${destination.slug}-transfer]`, amount: action.amount, type: 'income' as const, created_at: when },
    ]
    return {
      kind: action.type,
      command: { operation: 'transactions.insert', records },
      preview: preview('Crea trasferimento', [
        { label: 'Da', after: source.name },
        { label: 'A', after: destination.name },
        { label: 'Importo', after: `€${action.amount.toFixed(2)}` },
        { label: 'Data', after: action.date },
      ]),
    }
  }

  if (action.type === 'transfer.update' || action.type === 'transfer.delete') {
    const source = findTransaction(transactions, action.transactionId)
    const destination = findTransferPair(source, transactions, defaultWallet)
    const sourceParsed = parseTransaction(source, defaultWallet)
    const destinationParsed = parseTransaction(destination, defaultWallet)
    const before = [normalizeTransaction(source), normalizeTransaction(destination)]
    if (action.type === 'transfer.delete') {
      return {
        kind: action.type,
        command: { operation: 'transactions.delete', before },
        preview: preview('Elimina trasferimento', [
          { label: 'Da', before: walletBySlug(wallets, sourceParsed.wallet).name },
          { label: 'A', before: walletBySlug(wallets, destinationParsed.wallet).name },
          { label: 'Importo', before: `€${Number(source.amount).toFixed(2)}` },
          { label: 'Data', before: source.created_at.slice(0, 10) },
        ], 'Verranno eliminati entrambi i movimenti del trasferimento.'),
      }
    }
    const sourceWallet = action.changes.sourceWallet ? walletBySlug(wallets, action.changes.sourceWallet) : walletBySlug(wallets, sourceParsed.wallet)
    const destinationWallet = action.changes.destinationWallet ? walletBySlug(wallets, action.changes.destinationWallet) : walletBySlug(wallets, destinationParsed.wallet)
    if (sourceWallet.slug === destinationWallet.slug) throw new Error('Scegli due portafogli diversi per il trasferimento.')
    const amount = action.changes.amount ?? Number(source.amount)
    const when = action.changes.date ? dateWithExistingTime(action.changes.date, source.created_at) : source.created_at
    const label = `Spostamento ${sourceWallet.name} ➔ ${destinationWallet.name}`
    const after = [
      { ...before[0], title: `${label} [${sourceWallet.slug}-transfer]`, amount, type: 'expense' as const, created_at: when },
      { ...before[1], title: `${label} [${destinationWallet.slug}-transfer]`, amount, type: 'income' as const, created_at: when },
    ]
    return {
      kind: action.type,
      command: { operation: 'transactions.update', before, after },
      preview: preview('Modifica trasferimento', [
        { label: 'Da', before: walletBySlug(wallets, sourceParsed.wallet).name, after: sourceWallet.name },
        { label: 'A', before: walletBySlug(wallets, destinationParsed.wallet).name, after: destinationWallet.name },
        { label: 'Importo', before: `€${Number(source.amount).toFixed(2)}`, after: `€${amount.toFixed(2)}` },
        { label: 'Data', before: source.created_at.slice(0, 10), after: when.slice(0, 10) },
      ]),
    }
  }

  if (action.type === 'wallet.create') {
    const walletSlug = slugifyWalletName(action.name)
    if (!walletSlug) throw new Error('Il nome non produce uno slug valido per il portafoglio.')
    if (wallets.some(wallet => wallet.slug === walletSlug)) throw new Error('Esiste già un portafoglio con questo nome o con un nome simile.')
    const record = { slug: walletSlug, name: action.name, description: action.description ?? null, position: wallets.length }
    return {
      kind: action.type,
      command: { operation: 'wallets.insert', record },
      preview: preview('Crea portafoglio', [
        { label: 'Nome', after: record.name },
        { label: 'Slug', after: record.slug },
        { label: 'Descrizione', after: record.description },
      ]),
    }
  }

  if (action.type === 'wallet.update') {
    const current = normalizeWallet(findWallet(wallets, action.walletId))
    const after = { ...current, ...action.changes, description: action.changes.description === undefined ? current.description : action.changes.description }
    const fields = []
    if (current.name !== after.name) fields.push({ label: 'Nome', before: current.name, after: after.name })
    if (current.description !== after.description) fields.push({ label: 'Descrizione', before: current.description, after: after.description })
    return { kind: action.type, command: { operation: 'wallets.update', before: current, after }, preview: preview('Modifica portafoglio', fields) }
  }

  if (action.type === 'wallet.delete') {
    const current = normalizeWallet(findWallet(wallets, action.walletId))
    const affected = new Map<string, Transaction>()
    for (const transaction of transactions) {
      if (parseTransaction(transaction, defaultWallet).wallet === current.slug) affected.set(transaction.id, transaction)
    }
    for (const transaction of [...affected.values()]) {
      if (!transaction.title.endsWith('-transfer]')) continue
      const pair = findTransferPair(transaction, transactions, defaultWallet)
      affected.set(pair.id, pair)
    }
    const rows = [...affected.values()].map(normalizeTransaction)
    if (rows.length > 1000) throw new Error('Questo portafoglio contiene troppi movimenti da gestire in una sola conferma.')
    const walletBalance = getWalletBalances(transactions, wallets.map(item => item.slug), defaultWallet)[current.slug] || 0
    if (wallets.length <= 1) throw new Error('Deve restare almeno un portafoglio. Crea prima un altro portafoglio.')
    return {
      kind: action.type,
      command: { operation: 'wallets.delete', before: current, transactions: rows },
      preview: preview('Elimina portafoglio', [
        { label: 'Portafoglio', before: `${current.name} (${current.slug})` },
        { label: 'Saldo attuale', before: `€${walletBalance.toFixed(2)}` },
        { label: 'Movimenti eliminati', before: null, after: String(rows.length) },
        { label: 'Movimenti di trasferimento coinvolti', before: null, after: String(rows.filter(row => row.title.endsWith('-transfer]')).length) },
      ], rows.length ? 'Saranno eliminati anche tutti i movimenti collegati, compresi i due lati dei trasferimenti.' : 'Il portafoglio verrà eliminato definitivamente.'),
    }
  }

  if (action.type === 'memory.replace') {
    const before = context.memoryText || ''
    if (before === action.text) throw new Error('La memoria contiene già queste informazioni.')
    return {
      kind: action.type,
      command: { operation: 'memory.replace', before, after: action.text },
      preview: preview('Aggiorna memoria Sparkle', [
        { label: 'Prima', before: before || 'Memoria vuota' },
        { label: 'Dopo', after: action.text || 'Memoria vuota' },
      ]),
    }
  }

  throw new Error('Tipo di operazione non supportato.')
}
