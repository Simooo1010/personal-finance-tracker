import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Read-only access layer for AI clients. This is the write barrier: the
 * user-scoped Supabase client technically carries the user's full privileges,
 * so AI code never receives it directly. It receives a ReadOnlyDb that only
 * exposes `from(table).select(...)` for an allowlist of the user's own tables.
 * No insert/update/delete/upsert/rpc/auth/storage, and the oauth_* tables are
 * unreachable by construction. RLS still isolates users from each other.
 */

/** Per-table column allowlist: the only columns AI clients may select or filter on. */
export const TABLE_COLUMNS = {
  wallets: ['id', 'slug', 'name', 'description', 'position', 'created_at'],
  transactions: ['id', 'created_at', 'title', 'amount', 'type'],
  chat_sessions: ['id', 'title', 'created_at', 'updated_at'],
  chat_messages: ['id', 'session_id', 'role', 'content', 'created_at'],
  ai_analysis: [
    'id',
    'analysis_text',
    'first_generation_time',
    'last_generation_time',
    'last_auto_generation_time',
    'created_at',
  ],
  user_ai_memory: ['id', 'memory_text', 'updated_at'],
  action_logs: ['id', 'created_at', 'type', 'label', 'is_cancelled', 'undo_data', 'redo_data'],
} as const

export type AllowedTable = keyof typeof TABLE_COLUMNS

export const ALLOWED_TABLES = Object.keys(TABLE_COLUMNS) as AllowedTable[]

export function isAllowedTable(name: string): name is AllowedTable {
  return Object.prototype.hasOwnProperty.call(TABLE_COLUMNS, name)
}

/** Only the select entry point of a table: no mutation methods exist on this type. */
export type ReadOnlyTable = Pick<ReturnType<SupabaseClient['from']>, 'select'>

export interface ReadOnlyDb {
  from(table: AllowedTable): ReadOnlyTable
}

export function createReadOnlyDb(client: SupabaseClient): ReadOnlyDb {
  return {
    from(table: AllowedTable): ReadOnlyTable {
      if (!isAllowedTable(table)) {
        throw new Error(`Tabella non consentita: ${String(table)}`)
      }
      const builder = client.from(table)
      return { select: builder.select.bind(builder) } as ReadOnlyTable
    },
  }
}
