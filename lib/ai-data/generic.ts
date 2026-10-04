import { TABLE_COLUMNS, isAllowedTable, type AllowedTable, type ReadOnlyDb } from './readonly'

/**
 * Generic read-only data access for AI clients. Uses ONLY db.from(table).select(...)
 * from the ReadOnlyDb write barrier: no mutations are possible from here.
 */

const TABLE_NOTES: Record<AllowedTable, string> = {
  wallets:
    'User wallets (accounts). slug is the identifier used inside transaction titles; position is the display order.',
  transactions:
    "Financial movements. title encodes the wallet slug as a trailing ' [slug]'; transfers between wallets end with '-transfer]'; debt-related rows start with '[DEBT:{json}]'. amount is always positive; type is 'income' or 'expense' (sign is given by type).",
  chat_sessions: 'AI chat sessions of the user.',
  chat_messages: "Messages of AI chat sessions; session_id references chat_sessions.id; role is 'user' or 'assistant'.",
  ai_analysis: 'Generated AI financial analysis text with generation timestamps.',
  user_ai_memory: 'Persistent memory notes the AI keeps about the user.',
  action_logs:
    'Undo/redo history of user actions. undo_data/redo_data are large JSON payloads and are excluded by default; request them explicitly in columns if needed.',
}

const HEAVY_COLUMNS: Partial<Record<AllowedTable, readonly string[]>> = {
  action_logs: ['undo_data', 'redo_data'],
}

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500
// Kept below the 100k whole-response cap in app/api/mcp/route.ts so rows are cut cleanly, not as a raw preview.
const MAX_RESPONSE_CHARS = 80_000

export function describeData(): {
  tables: Array<{ name: AllowedTable; columns: string[]; notes: string }>
} {
  const tables = (Object.keys(TABLE_COLUMNS) as AllowedTable[]).map((name) => ({
    name,
    columns: [...TABLE_COLUMNS[name]],
    notes: TABLE_NOTES[name],
  }))
  return { tables }
}

export type DataFilter = {
  column: string
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'ilike' | 'in'
  value: string | number | boolean | Array<string | number>
}

export interface QueryDataArgs {
  table: string
  columns?: string[]
  filters?: DataFilter[]
  order_by?: string
  ascending?: boolean
  limit?: number
  offset?: number
}

export interface QueryDataResult {
  table: AllowedTable
  rows: Record<string, unknown>[]
  count: number | null
  limit: number
  offset: number
  truncated: boolean
}

type Scalar = string | number | boolean

/** Minimal structural view of the PostgREST filter builder used here. */
interface FilterChain {
  eq(column: string, value: Scalar): FilterChain
  neq(column: string, value: Scalar): FilterChain
  gt(column: string, value: Scalar): FilterChain
  gte(column: string, value: Scalar): FilterChain
  lt(column: string, value: Scalar): FilterChain
  lte(column: string, value: Scalar): FilterChain
  ilike(column: string, pattern: string): FilterChain
  in(column: string, values: ReadonlyArray<string | number>): FilterChain
  order(column: string, options: { ascending: boolean }): FilterChain
  range(from: number, to: number): FilterChain
  then: PromiseLike<{
    data: unknown[] | null
    error: { message: string } | null
    count: number | null
  }>['then']
}

function asFilterChain(builder: unknown): FilterChain {
  return builder as FilterChain
}

const VALID_OPS: ReadonlySet<DataFilter['op']> = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'ilike',
  'in',
])

function toInt(value: unknown, fallback: number, name: string): number {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Parametro '${name}' non valido: deve essere un numero`)
  }
  return Math.trunc(value)
}

function isScalar(value: unknown): value is Scalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

export async function queryData(db: ReadOnlyDb, args: QueryDataArgs): Promise<QueryDataResult> {
  const { table } = args
  if (typeof table !== 'string' || !isAllowedTable(table)) {
    throw new Error(
      `Tabella non consentita: ${String(table)}. Tabelle disponibili: ${Object.keys(TABLE_COLUMNS).join(', ')}`,
    )
  }

  const allowed: readonly string[] = TABLE_COLUMNS[table]
  const assertColumn = (col: unknown, context: string): string => {
    if (typeof col !== 'string' || !allowed.includes(col)) {
      throw new Error(
        `Colonna non consentita (${context}): ${String(col)}. Colonne di '${table}': ${allowed.join(', ')}`,
      )
    }
    return col
  }

  let columns: string[]
  if (args.columns && args.columns.length > 0) {
    columns = Array.from(new Set(args.columns.map((c) => assertColumn(c, 'columns'))))
  } else {
    const heavy = HEAVY_COLUMNS[table] ?? []
    columns = allowed.filter((c) => !heavy.includes(c))
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, toInt(args.limit, DEFAULT_LIMIT, 'limit')))
  const offset = toInt(args.offset, 0, 'offset')
  if (offset < 0) throw new Error("Parametro 'offset' non valido: deve essere >= 0")

  let query = asFilterChain(db.from(table).select(columns.join(','), { count: 'exact' }))

  for (const filter of args.filters ?? []) {
    const column = assertColumn(filter?.column, 'filters')
    const { op, value } = filter
    if (!VALID_OPS.has(op)) {
      throw new Error(`Operatore di filtro non valido: ${String(op)}`)
    }
    if (op === 'in') {
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' || typeof v === 'number')) {
        throw new Error(`Il filtro 'in' su '${column}' richiede un array di stringhe o numeri`)
      }
      query = query.in(column, value)
      continue
    }
    if (!isScalar(value)) {
      throw new Error(`Il filtro '${op}' su '${column}' richiede un valore scalare`)
    }
    switch (op) {
      case 'eq':
        query = query.eq(column, value)
        break
      case 'neq':
        query = query.neq(column, value)
        break
      case 'gt':
        query = query.gt(column, value)
        break
      case 'gte':
        query = query.gte(column, value)
        break
      case 'lt':
        query = query.lt(column, value)
        break
      case 'lte':
        query = query.lte(column, value)
        break
      case 'ilike':
        query = query.ilike(column, String(value))
        break
    }
  }

  const ascending = args.ascending ?? true
  let orderCol: string | undefined
  if (args.order_by !== undefined) {
    orderCol = assertColumn(args.order_by, 'order_by')
    query = query.order(orderCol, { ascending })
  }
  // Final tie-break on id so limit/offset pagination is deterministic.
  if (allowed.includes('id') && orderCol !== 'id') {
    query = query.order('id', { ascending })
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) {
    throw new Error(`Errore nella lettura di '${table}': ${error.message}`)
  }

  const { rows, truncated } = capRows((data ?? []) as Record<string, unknown>[])
  return { table, rows, count: count ?? null, limit, offset, truncated }
}

const MAX_FIELD_CHARS = 20_000

/** Shortens oversized fields of a single row (used only when one row alone exceeds the cap). */
function shrinkRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    out[key] =
      text !== undefined && text.length > MAX_FIELD_CHARS ? `${text.slice(0, MAX_FIELD_CHARS)}…[truncated]` : value
  }
  return out
}

/**
 * Keeps leading rows while the serialized total stays within MAX_RESPONSE_CHARS
 * (each row serialized once). Always keeps at least the first row, shrinking its
 * oversized fields if it alone exceeds the cap.
 */
function capRows(all: Record<string, unknown>[]): { rows: Record<string, unknown>[]; truncated: boolean } {
  const rows: Record<string, unknown>[] = []
  let total = 2 // the surrounding []
  for (const row of all) {
    const size = JSON.stringify(row).length + (rows.length > 0 ? 1 : 0) // + comma
    if (total + size > MAX_RESPONSE_CHARS) {
      if (rows.length === 0) return { rows: [shrinkRow(row)], truncated: true }
      return { rows, truncated: true }
    }
    rows.push(row)
    total += size
  }
  return { rows, truncated: false }
}
