import { describe, expect, it } from 'vitest'

import type { Stop } from '@/api/types'

import { buildTimeline, positionAt } from './timeline'

const T = (hhmm: string) => Date.parse(`2026-07-30T${hhmm}:00Z`)

function stop(partial: Partial<Stop> & Pick<Stop, 'sequence' | 'kind' | 'mile_marker'>): Stop {
  return {
    status: 'ON',
    label: '',
    location: '',
    lat: null,
    lng: null,
    arrive_at: '2026-07-30T08:00:00Z',
    depart_at: '2026-07-30T08:15:00Z',
    duration_hr: 0.25,
    ...partial,
  }
}

const STOPS: Stop[] = [
  stop({ sequence: 1, kind: 'pre_trip', mile_marker: 0, arrive_at: '2026-07-30T08:00:00Z', depart_at: '2026-07-30T08:15:00Z' }),
  stop({ sequence: 2, kind: 'pickup', mile_marker: 120, arrive_at: '2026-07-30T10:15:00Z', depart_at: '2026-07-30T11:15:00Z' }),
  stop({ sequence: 3, kind: 'rest_10', mile_marker: 400, status: 'SB', arrive_at: '2026-07-30T16:15:00Z', depart_at: '2026-07-31T02:15:00Z' }),
]

describe('buildTimeline', () => {
  it('alternates parked and driving segments in mile order', () => {
    const segs = buildTimeline([...STOPS].reverse())
    expect(segs.map((s) => [s.status, s.startMile, s.endMile, s.stop?.sequence ?? null])).toEqual([
      ['ON', 0, 0, 1],
      ['D', 0, 120, null],
      ['ON', 120, 120, 2],
      ['D', 120, 400, null],
      ['SB', 400, 400, 3],
    ])
    expect(segs[1].start).toBe(T('08:15'))
    expect(segs[1].end).toBe(T('10:15'))
  })

  it('leaves out a stop whose times cannot be parsed', () => {
    const broken = stop({
      sequence: 9,
      kind: 'fuel',
      mile_marker: 200,
      arrive_at: 'n/a',
      depart_at: 'n/a',
    })
    const segs = buildTimeline([...STOPS, broken])
    expect(segs.some((s) => Number.isNaN(s.start) || Number.isNaN(s.end))).toBe(false)
    expect(segs.map((s) => s.stop?.sequence).filter(Boolean)).toEqual([1, 2, 3])
  })
})

describe('positionAt', () => {
  const segs = buildTimeline(STOPS)

  it('interpolates the mile while driving and names the next stop', () => {
    const at = positionAt(segs, T('09:15'))
    expect(at.mile).toBeCloseTo(60, 6)
    expect(at.status).toBe('D')
    expect(at.stop).toBeNull()
    expect(at.next?.sequence).toBe(2)
  })

  it('is parked during a stop', () => {
    const at = positionAt(segs, T('10:45'))
    expect(at.mile).toBe(120)
    expect(at.status).toBe('ON')
    expect(at.stop?.sequence).toBe(2)
    expect(at.next?.sequence).toBe(3)
  })

  it('clamps before the start and after the end', () => {
    expect(positionAt(segs, T('00:00'))).toMatchObject({ mile: 0, status: 'ON' })
    expect(positionAt(segs, Date.parse('2026-08-01T00:00:00Z'))).toMatchObject({
      mile: 400,
      status: 'SB',
      next: null,
    })
  })

  it('handles an empty timeline', () => {
    expect(positionAt([], 0)).toEqual({ mile: 0, status: 'OFF', stop: null, next: null })
  })
})
