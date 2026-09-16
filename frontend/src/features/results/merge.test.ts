import { describe, expect, it } from 'vitest'

import type { Step, Stop } from '@/api/types'
import { formatDuration, formatMiles } from '@/domain/format'

import { collapseSteps, mergeItinerary } from './merge'

const step = (seq: number, mile: number, distance = 10): Step => ({
  sequence: seq,
  instruction: `Continue ${seq}`,
  distance_mi: distance,
  duration_hr: distance / 55,
  mile_marker: mile,
})

const stop = (seq: number, mile: number, kind: Stop['kind'] = 'fuel'): Stop => ({
  sequence: seq,
  kind,
  status: 'ON',
  label: kind,
  location: 'Amarillo, TX',
  lat: 35.2,
  lng: -101.8,
  arrive_at: '2026-08-03T12:00:00Z',
  depart_at: '2026-08-03T12:30:00Z',
  duration_hr: 0.5,
  mile_marker: mile,
})

describe('mergeItinerary', () => {
  it('interleaves steps and stops by mile marker', () => {
    const merged = mergeItinerary(
      [step(0, 0), step(1, 500), step(2, 1200)],
      [stop(0, 400), stop(1, 1000)],
    )
    expect(merged.map((e) => e.mile)).toEqual([0, 400, 500, 1000, 1200])
  })

  it('keeps the two payloads distinguishable', () => {
    const merged = mergeItinerary([step(0, 0)], [stop(0, 100)])
    expect(merged.map((e) => e.type)).toEqual(['step', 'stop'])
  })

  it('puts a stop before a step at the same mile', () => {
    // You arrive somewhere before being told where to turn next.
    const merged = mergeItinerary([step(0, 500)], [stop(0, 500)])
    expect(merged.map((e) => e.type)).toEqual(['stop', 'step'])
  })

  it('handles an empty route', () => {
    expect(mergeItinerary([], [])).toEqual([])
  })

  it('handles stops with no steps', () => {
    expect(mergeItinerary([], [stop(0, 10), stop(1, 5)]).map((e) => e.mile)).toEqual([5, 10])
  })

  it('carries the stop payload through', () => {
    const [entry] = mergeItinerary([], [stop(0, 100, 'rest_10')])
    expect(entry).toMatchObject({ type: 'stop', kind: 'rest_10', location: 'Amarillo, TX' })
  })
})

describe('collapseSteps', () => {
  const many = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => step(i, from + i * 10))

  it('leaves short runs alone', () => {
    const merged = mergeItinerary(many(3), [])
    expect(collapseSteps(merged, 3).every((e) => e.type === 'step')).toBe(true)
  })

  it('collapses a long run into a gap marker', () => {
    const collapsed = collapseSteps(mergeItinerary(many(20), []), 3)
    expect(collapsed.filter((e) => e.type === 'step')).toHaveLength(3)
    const gap = collapsed.find((e) => e.type === 'gap')
    expect(gap).toMatchObject({ hiddenCount: 17 })
  })

  it('sums the distance hidden inside a gap', () => {
    const collapsed = collapseSteps(mergeItinerary(many(10), []), 2)
    const gap = collapsed.find((e) => e.type === 'gap')!
    expect(gap.type === 'gap' && gap.distanceMi).toBe(80) // 8 hidden steps x 10 mi
  })

  it('never hides a stop', () => {
    const merged = mergeItinerary(many(30), [stop(0, 100), stop(1, 200)])
    const collapsed = collapseSteps(merged, 2)
    expect(collapsed.filter((e) => e.type === 'stop')).toHaveLength(2)
  })

  it('restarts the run after each stop, so stops stay visible in context', () => {
    const merged = mergeItinerary([...many(10, 0), ...many(10, 500)], [stop(0, 400)])
    const collapsed = collapseSteps(merged, 2)
    // two runs -> two gap markers
    expect(collapsed.filter((e) => e.type === 'gap')).toHaveLength(2)
  })

  it('preserves overall ordering', () => {
    const merged = mergeItinerary(many(20), [stop(0, 55), stop(1, 155)])
    const miles = collapseSteps(merged, 3).map((e) => e.mile)
    expect(miles).toEqual([...miles].sort((a, b) => a - b))
  })
})

describe('formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(0.5)).toBe('30 min')
    expect(formatDuration(10)).toBe('10 h')
    expect(formatDuration(1.25)).toBe('1 h 15 min')
    expect(formatDuration(34)).toBe('34 h')
  })

  it('formats miles with thousands separators', () => {
    expect(formatMiles(1645.7)).toBe('1,646 mi')
    expect(formatMiles(0)).toBe('0 mi')
  })
})

describe('collapseSteps — expansion', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => step(i, i * 10))

  it('reveals a run when its gap key is expanded', () => {
    const merged = mergeItinerary(many(20), [])
    const collapsed = collapseSteps(merged, 3)
    const gapKey = collapsed.find((e) => e.type === 'gap')!.key

    const opened = collapseSteps(merged, 3, new Set([gapKey]))
    expect(opened.filter((e) => e.type === 'step')).toHaveLength(20)
  })

  it('keeps the toggle visible once open, so it can be closed again', () => {
    const merged = mergeItinerary(many(20), [])
    const gapKey = collapseSteps(merged, 3).find((e) => e.type === 'gap')!.key
    const opened = collapseSteps(merged, 3, new Set([gapKey]))
    expect(opened.filter((e) => e.type === 'gap')).toHaveLength(1)
  })

  it('expanding one run leaves the others collapsed', () => {
    const merged = mergeItinerary(
      [...many(10), ...Array.from({ length: 10 }, (_, i) => step(100 + i, 500 + i * 10))],
      [stop(0, 400)],
    )
    const gaps = collapseSteps(merged, 2).filter((e) => e.type === 'gap')
    expect(gaps).toHaveLength(2)

    const opened = collapseSteps(merged, 2, new Set([gaps[0].key]))
    expect(opened.filter((e) => e.type === 'gap')).toHaveLength(2)
    expect(opened.filter((e) => e.type === 'step').length).toBeGreaterThan(
      collapseSteps(merged, 2).filter((e) => e.type === 'step').length,
    )
  })

  it('an unknown key changes nothing', () => {
    const merged = mergeItinerary(many(20), [])
    expect(collapseSteps(merged, 3, new Set(['nope']))).toEqual(collapseSteps(merged, 3))
  })
})
