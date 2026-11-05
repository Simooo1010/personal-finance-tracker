import { describe, expect, it } from 'vitest'
import { inRange, parseSince, parseUntil, romeMonthKey } from '../lib/ai-data/dates'

describe('Rome date filters', () => {
  it.each([
    ['2025-03-30', '2025-03-29T23:00:00Z', '2025-03-30T22:00:00Z'],
    ['2025-10-26', '2025-10-25T22:00:00Z', '2025-10-26T23:00:00Z'],
  ])('includes the whole local day on %s across a DST change', (date, start, next) => {
    const startMs = Date.parse(start)
    const nextMs = Date.parse(next)
    const since = parseSince(date)
    const until = parseUntil(date)

    expect(since).toBe(startMs)
    expect(until).toEqual({ ms: nextMs, exclusive: true })
    expect(inRange(startMs - 1, since, until)).toBe(false)
    expect(inRange(startMs, since, until)).toBe(true)
    expect(inRange(nextMs - 1, since, until)).toBe(true)
    expect(inRange(nextMs, since, until)).toBe(false)
  })

  it('includes an explicit timestamp at the upper bound', () => {
    const timestamp = '2025-07-01T01:00:00+02:00'
    const instant = Date.parse('2025-06-30T23:00:00Z')
    const until = parseUntil(timestamp)

    expect(until).toEqual({ ms: instant, exclusive: false })
    expect(inRange(instant, undefined, until)).toBe(true)
    expect(inRange(instant + 1, undefined, until)).toBe(false)
  })

  it('buckets a transaction by the Rome month across UTC month end', () => {
    expect(romeMonthKey(Date.parse('2025-06-30T21:59:59Z'))).toBe('2025-06')
    expect(romeMonthKey(Date.parse('2025-06-30T22:00:00Z'))).toBe('2025-07')
  })

  it('rejects impossible calendar dates instead of rolling into the next month', () => {
    expect(() => parseSince('2025-02-29')).toThrow()
    expect(() => parseUntil('2025-04-31')).toThrow()
  })
})
