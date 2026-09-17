import { describe, expect, it } from 'vitest'

import { formatClock, formatDateTime, formatDuration, formatIsoDate, formatMiles } from './format'

describe('guards', () => {
  it('falls back to the browser zone when the zone is unknown, instead of throwing', () => {
    expect(() => formatClock('2026-07-30T03:00:00Z', 'Mars/Base')).not.toThrow()
    expect(formatIsoDate('2026-07-30T12:00:00Z', 'Mars/Base')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('renders a dash for input it cannot make sense of', () => {
    expect(formatClock('yesterday')).toBe('—')
    expect(formatDateTime('')).toBe('—')
    expect(formatIsoDate('n/a')).toBe('')
    expect(formatMiles(Number.NaN)).toBe('—')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('formatIsoDate', () => {
  it('gives the calendar date in the given zone, not the browser zone', () => {
    // 03:00 UTC is still the previous evening in Chicago, and mid-morning in Karachi.
    expect(formatIsoDate('2026-07-30T03:00:00Z', 'America/Chicago')).toBe('2026-07-29')
    expect(formatIsoDate('2026-07-30T03:00:00Z', 'Asia/Karachi')).toBe('2026-07-30')
  })

  it('matches the LogDay.date shape', () => {
    expect(formatIsoDate('2026-01-05T12:00:00Z', 'UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('formatDuration', () => {
  it('drops the unit that is zero', () => {
    expect(formatDuration(9 + 40 / 60)).toBe('9 h 40 min')
    expect(formatDuration(0.75)).toBe('45 min')
    expect(formatDuration(2)).toBe('2 h')
  })
})

describe('formatMiles', () => {
  it('rounds and groups thousands', () => {
    expect(formatMiles(2153.6)).toBe('2,154 mi')
  })
})
