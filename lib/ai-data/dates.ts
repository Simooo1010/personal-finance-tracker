/**
 * Date handling for AI date filters and month bucketing. The app's users are in
 * Italy, so calendar days/months are interpreted in Europe/Rome:
 * - a date-only string ('YYYY-MM-DD') as `since` = start of that Rome day;
 * - a date-only string as `until` = the WHOLE Rome day (exclusive bound at the
 *   start of the next day);
 * - full ISO datetimes (with Z/offset) are used as-is, `until` inclusive.
 * Uses Intl only, no extra dependencies.
 */

export const APP_TIME_ZONE = 'Europe/Rome'

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

const romeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** Wall-clock parts of an instant in Europe/Rome. */
function romeParts(ms: number) {
  const parts: Record<string, number> = {}
  for (const p of romeFormatter.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second }
}

/** Rome UTC offset (ms) at a given instant. */
function romeOffset(ms: number): number {
  const p = romeParts(ms)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(ms / 1000) * 1000
}

/** Instant of 00:00 Rome time on the given calendar day (month 1-12; overflow allowed). */
export function romeStartOfDay(year: number, month: number, day: number): number {
  const guess = Date.UTC(year, month - 1, day)
  const first = guess - romeOffset(guess)
  // Re-check the offset at the computed instant (DST change between guess and result).
  return guess - romeOffset(first)
}

/** 'YYYY-MM' of an instant in Europe/Rome. */
export function romeMonthKey(ms: number): string {
  const p = romeParts(ms)
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}

/** Current Rome year/month (month 1-12). */
export function romeYearMonth(ms: number = Date.now()): { year: number; month: number } {
  const p = romeParts(ms)
  return { year: p.year, month: p.month }
}

function parseDateOnly(value: string, field: string): { y: number; m: number; d: number } | null {
  const match = DATE_ONLY.exec(value)
  if (!match) return null
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const check = new Date(Date.UTC(y, m - 1, d))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error(`Data non valida per "${field}": ${value}`)
  }
  return { y, m, d }
}

function parseInstant(value: string, field: string): number {
  const ms = new Date(value).getTime()
  if (Number.isNaN(ms)) throw new Error(`Data non valida per "${field}": ${value}`)
  return ms
}

/** Lower bound (inclusive), in ms. Date-only = start of that Rome day. */
export function parseSince(value: string | undefined | null, field = 'since'): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const day = parseDateOnly(value, field)
  return day ? romeStartOfDay(day.y, day.m, day.d) : parseInstant(value, field)
}

/** Upper bound. Date-only = whole Rome day (exclusive at next day start); datetimes inclusive. */
export interface UntilBound {
  ms: number
  exclusive: boolean
}

export function parseUntil(value: string | undefined | null, field = 'until'): UntilBound | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const day = parseDateOnly(value, field)
  if (day) return { ms: romeStartOfDay(day.y, day.m, day.d + 1), exclusive: true }
  return { ms: parseInstant(value, field), exclusive: false }
}

export function inRange(dateMs: number, since?: number, until?: UntilBound): boolean {
  if (since === undefined && until === undefined) return true
  if (Number.isNaN(dateMs)) return false
  if (since !== undefined && dateMs < since) return false
  if (until !== undefined && (until.exclusive ? dateMs >= until.ms : dateMs > until.ms)) return false
  return true
}
