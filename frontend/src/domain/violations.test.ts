import { describe, expect, it } from 'vitest'

import { formatLimit, violationLabel } from './violations'

describe('violationLabel', () => {
  it('names every rule the server emits', () => {
    expect(violationLabel('11_hour_driving')).toBe('11-hour driving limit')
    expect(violationLabel('14_hour_window')).toBe('14-hour duty window')
    expect(violationLabel('30_minute_break')).toBe('30-minute break')
    expect(violationLabel('70_hour_cycle')).toBe('70-hour / 8-day cycle')
  })

  it('humanises an unknown kind instead of leaking snake_case', () => {
    expect(violationLabel('sleeper_split_pairing')).toBe('Sleeper split pairing')
  })
})

describe('formatLimit', () => {
  it('reads as actual against limit, in hours', () => {
    expect(formatLimit({ actual: 11.5, limit: 11 })).toBe('11.50 h of 11 h')
  })
})
