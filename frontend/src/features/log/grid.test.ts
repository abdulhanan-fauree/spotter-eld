/**
 * Grid geometry.
 *
 * The FMCSA p.18 log (John Doe, Richmond VA -> Newark NJ) is the fixture, so the
 * coordinate maths is pinned against the regulator's own worked example.
 */

import { describe, expect, it } from 'vitest'
import { formatHours } from '@/domain/format'

import {
  GRID_BOTTOM,
  L,
  MINUTES_PER_DAY,
  type Segment,
  dutyPath,
  hourLabels,
  placeRemarks,
  quarterTicks,
  rowTop,
  totalsFor,
  x,
  xClamped,
  y,
} from './grid'

/** FMCSA guide p.18, in minutes. */
const JOHN_DOE: Segment[] = [
  { status: 'OFF', start_minute: 0, end_minute: 360 },
  { status: 'ON', start_minute: 360, end_minute: 450 },
  { status: 'D', start_minute: 450, end_minute: 540 },
  { status: 'ON', start_minute: 540, end_minute: 570 },
  { status: 'D', start_minute: 570, end_minute: 720 },
  { status: 'OFF', start_minute: 720, end_minute: 780 },
  { status: 'D', start_minute: 780, end_minute: 900 },
  { status: 'ON', start_minute: 900, end_minute: 930 },
  { status: 'D', start_minute: 930, end_minute: 960 },
  { status: 'SB', start_minute: 960, end_minute: 1065 },
  { status: 'D', start_minute: 1065, end_minute: 1140 },
  { status: 'ON', start_minute: 1140, end_minute: 1260 },
  { status: 'OFF', start_minute: 1260, end_minute: 1440 },
]

describe('x()', () => {
  it('maps midnight to the left edge', () => {
    expect(x(0)).toBe(L.gridX)
  })

  it('maps noon to the middle', () => {
    expect(x(720)).toBeCloseTo(L.gridX + L.gridW / 2, 6)
  })

  it('maps the end of the day to the right edge', () => {
    expect(xClamped(MINUTES_PER_DAY)).toBeCloseTo(L.gridX + L.gridW, 6)
  })

  it('is linear in time', () => {
    const perHour = L.gridW / 24
    for (let h = 0; h <= 23; h++) {
      expect(x(h * 60)).toBeCloseTo(L.gridX + h * perHour, 6)
    }
  })

  it('is monotonic', () => {
    const xs = Array.from({ length: 100 }, (_, i) => x(i * 14))
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
  })

  it('honours a non-midnight start of the 24-hour period', () => {
    // Guide p.16: the carrier designates the starting time; it need not be 00:00.
    expect(x(360, 360)).toBe(L.gridX)
    expect(x(300, 360)).toBeCloseTo(L.gridX + (1380 / 1440) * L.gridW, 6)
  })
})

describe('y()', () => {
  it('orders the rows Off Duty, Sleeper Berth, Driving, On Duty', () => {
    expect(y('OFF')).toBeLessThan(y('SB'))
    expect(y('SB')).toBeLessThan(y('D'))
    expect(y('D')).toBeLessThan(y('ON'))
  })

  it('centres each row', () => {
    expect(y('OFF')).toBeCloseTo(rowTop('OFF') + L.rowH / 2, 6)
    expect(y('ON')).toBeCloseTo(rowTop('ON') + L.rowH / 2, 6)
  })

  it('keeps all four rows inside the grid', () => {
    for (const s of ['OFF', 'SB', 'D', 'ON'] as const) {
      expect(y(s)).toBeGreaterThan(L.gridY)
      expect(y(s)).toBeLessThan(GRID_BOTTOM)
    }
  })
})

describe('dutyPath()', () => {
  it('is empty for no segments', () => {
    expect(dutyPath([])).toBe('')
  })

  it('starts at the first segment and is one continuous stroke', () => {
    const d = dutyPath(JOHN_DOE)
    expect(d.startsWith(`M ${L.gridX.toFixed(2)}`)).toBe(true)
    // a single subpath: exactly one moveto
    expect(d.match(/M/g)?.length).toBe(1)
  })

  it('draws a horizontal run per segment', () => {
    expect(dutyPath(JOHN_DOE).match(/H/g)?.length).toBe(JOHN_DOE.length)
  })

  it('draws a vertical connector at each change of status', () => {
    // 13 segments, every adjacent pair differs -> 12 connectors
    expect(dutyPath(JOHN_DOE).match(/V/g)?.length).toBe(JOHN_DOE.length - 1)
  })

  it('does not draw a connector between same-status segments', () => {
    const d = dutyPath([
      { status: 'D', start_minute: 0, end_minute: 60 },
      { status: 'D', start_minute: 60, end_minute: 120 },
    ])
    expect(d).not.toContain('V')
  })

  it('reaches the right edge when the day is fully covered', () => {
    const d = dutyPath(JOHN_DOE)
    expect(d.trimEnd().endsWith((L.gridX + L.gridW).toFixed(2))).toBe(true)
  })

  it('sorts unordered segments before drawing', () => {
    const shuffled = [...JOHN_DOE].reverse()
    expect(dutyPath(shuffled)).toBe(dutyPath(JOHN_DOE))
  })
})

describe('totals', () => {
  it('reproduces the Total Hours column from guide p.19', () => {
    const t = totalsFor(JOHN_DOE)
    expect(t.OFF).toBeCloseTo(10.0, 6)
    expect(t.SB).toBeCloseTo(1.75, 6)
    expect(t.D).toBeCloseTo(7.75, 6)
    expect(t.ON).toBeCloseTo(4.5, 6)
  })

  it('sums to 24 hours', () => {
    const t = totalsFor(JOHN_DOE)
    expect(t.OFF + t.SB + t.D + t.ON).toBeCloseTo(24, 6)
  })

  it('formats to quarter-hour precision', () => {
    expect(formatHours(1.75)).toBe('1.75')
    expect(formatHours(10)).toBe('10.00')
  })
})

describe('hour labels', () => {
  it('has 24 entries', () => {
    expect(hourLabels()).toHaveLength(24)
  })

  it('labels midnight and noon, and leaves hour 1 blank as on the form', () => {
    const l = hourLabels()
    expect(l[0].label).toBe('Midnight')
    expect(l[1].label).toBe('')
    expect(l[12].label).toBe('Noon')
    expect(l[23].label).toBe('23')
  })
})

describe('quarter-hour ticks', () => {
  const ticks = quarterTicks()

  it('has three per hour', () => {
    expect(ticks).toHaveLength(24 * 3)
  })

  it('never lands on an hour boundary', () => {
    expect(ticks.every((t) => t.minute % 60 !== 0)).toBe(true)
  })

  it('makes the half-hour tick taller than the quarter-hour ones', () => {
    // The single detail that makes the grid read as authentic rather than approximate.
    const half = ticks.find((t) => t.minute === 30)!
    const quarter = ticks.find((t) => t.minute === 15)!
    expect(half.height).toBeGreaterThan(quarter.height)
  })

  it('keeps every tick inside its row', () => {
    expect(ticks.every((t) => t.height < L.rowH)).toBe(true)
  })
})

describe('placeRemarks()', () => {
  const SIX = [
    { minute: 360, location: 'Richmond, VA' },
    { minute: 540, location: 'Fredericksburg, VA' },
    { minute: 720, location: 'Baltimore, MD' },
    { minute: 900, location: 'Philadelphia, PA' },
    { minute: 960, location: 'Cherry Hill, NJ' },
    { minute: 1140, location: 'Newark, NJ' },
  ]

  it('anchors each label at the true time of the duty change', () => {
    const placed = placeRemarks(SIX)
    placed.forEach((p, i) => expect(p.anchorX).toBeCloseTo(x(SIX[i].minute), 6))
  })

  it('keeps labels at least the minimum spacing apart', () => {
    const placed = placeRemarks(SIX, 0, 46)
    for (let i = 1; i < placed.length; i++) {
      expect(placed[i].labelX - placed[i - 1].labelX).toBeGreaterThanOrEqual(46 - 1e-6)
    }
  })

  it('separates labels that would otherwise overlap', () => {
    // A fuel stop is two changes 30 minutes apart: ~15px, far less than a
    // rotated "Fredericksburg, VA" needs.
    const tight = [
      { minute: 540, location: 'Fredericksburg, VA' },
      { minute: 570, location: 'Fredericksburg, VA' },
    ]
    const placed = placeRemarks(tight)
    expect(placed[1].labelX - placed[0].labelX).toBeGreaterThanOrEqual(46 - 1e-6)
    // ...but the leader still points at the real time
    expect(placed[1].anchorX).toBeCloseTo(x(570), 6)
  })

  it('does not push labels past the right edge of the grid', () => {
    const late = [
      { minute: 1380, location: 'Somewhere, PA' },
      { minute: 1400, location: 'Elsewhere, NJ' },
      { minute: 1430, location: 'Newark, NJ' },
    ]
    const placed = placeRemarks(late)
    for (const p of placed) expect(p.labelX).toBeLessThanOrEqual(L.gridX + L.gridW + 1e-6)
  })

  it('sorts remarks by time', () => {
    const placed = placeRemarks([...SIX].reverse())
    expect(placed.map((p) => p.location)).toEqual(SIX.map((s) => s.location))
  })

  it('handles the empty case', () => {
    expect(placeRemarks([])).toEqual([])
  })
})
