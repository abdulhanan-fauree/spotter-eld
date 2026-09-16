/**
 * Geometry for the § 395.8 graph grid.
 *
 * Pure functions, no React — so the layout can be unit-tested without a DOM, and
 * so the paper renderer and the ELD renderer can share one coordinate system.
 *
 * Everything here was measured off the rendered FMCSA pages (guide pp.15, 16, 18,
 * 19) rather than the PDF text layer, because the grid is a graphic: the text
 * layer carries none of the tick structure and emits the Total Hours column in an
 * order that does not match the rows.
 */

import { DUTY_ORDER, type DutyStatus } from '@/domain/duty'

export const MINUTES_PER_DAY = 1440

/** Layout constants, in viewBox units. */
export const L = {
  width: 1000,
  gridX: 150,
  gridW: 740,
  gridY: 214,
  rowH: 26,
  totalsX: 890,
  totalsW: 96,
  hourLabelH: 14,
} as const

export const GRID_BOTTOM = L.gridY + L.rowH * 4

/**
 * Minute of the 24-hour period → x.
 *
 * `dayStartMinute` is the carrier-designated start of the period, which is not
 * necessarily midnight: "All drivers operating out of your home terminal must use
 * the same starting time for the 24-hour period, as designated by your employer"
 * (guide p.16; p.15 labels the grid's left edge "24-hour period starting time").
 */
export function x(minute: number, dayStartMinute = 0): number {
  const offset = ((minute - dayStartMinute) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return L.gridX + (offset / MINUTES_PER_DAY) * L.gridW
}

/** x for a minute that may legitimately equal 1440 (the right-hand edge). */
export function xClamped(minute: number, dayStartMinute = 0): number {
  if (minute - dayStartMinute >= MINUTES_PER_DAY) return L.gridX + L.gridW
  return x(minute, dayStartMinute)
}

/** Duty status → y at the centre of its row. */
export function y(status: DutyStatus): number {
  return L.gridY + L.rowH * (DUTY_ORDER.indexOf(status) + 0.5)
}

/** Top edge of a row. */
export function rowTop(status: DutyStatus): number {
  return L.gridY + L.rowH * DUTY_ORDER.indexOf(status)
}

/** x at an exact hour boundary. */
export function hourX(hour: number): number {
  return L.gridX + (hour / 24) * L.gridW
}

export interface Segment {
  status: DutyStatus
  start_minute: number
  end_minute: number
  note?: string
}

/**
 * The duty line as a single SVG path.
 *
 * "Draw a solid line between the appropriate time markers to show the periods of
 * time you are [off duty / in the sleeper berth / driving / on duty not driving]"
 * — guide p.17. So it is one continuous stroke: horizontal runs along the row
 * centres, joined by verticals at each change of status, exactly as a driver
 * would draw it with a pen.
 */
export function dutyPath(segments: Segment[], dayStartMinute = 0): string {
  if (segments.length === 0) return ''
  const ordered = [...segments].sort((a, b) => a.start_minute - b.start_minute)

  let d = `M ${x(ordered[0].start_minute, dayStartMinute).toFixed(2)} ${y(ordered[0].status).toFixed(2)}`
  ordered.forEach((seg, i) => {
    d += ` H ${xClamped(seg.end_minute, dayStartMinute).toFixed(2)}`
    const next = ordered[i + 1]
    if (next && next.status !== seg.status) d += ` V ${y(next.status).toFixed(2)}`
  })
  return d
}

/** Hour labels across the top: Midnight, (1 blank), 2…11, Noon, 13…23. */
export function hourLabels(): { hour: number; label: string }[] {
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: h === 0 ? 'Midnight' : h === 1 ? '' : h === 12 ? 'Noon' : String(h),
  }))
}

/**
 * Tick marks inside a row.
 *
 * Heights are not uniform on the real form: the 15- and 45-minute ticks are
 * short, the 30-minute tick is noticeably taller. That single detail is most of
 * what makes a rendered grid look authentic rather than approximate.
 */
export function quarterTicks(): { minute: number; height: number }[] {
  const ticks: { minute: number; height: number }[] = []
  for (let h = 0; h < 24; h++) {
    for (const q of [15, 30, 45]) {
      ticks.push({ minute: h * 60 + q, height: q === 30 ? L.rowH * 0.55 : L.rowH * 0.3 })
    }
  }
  return ticks
}

export function totalsFor(segments: Segment[]): Record<DutyStatus, number> {
  const totals: Record<DutyStatus, number> = { OFF: 0, SB: 0, D: 0, ON: 0 }
  for (const s of segments) totals[s.status] += (s.end_minute - s.start_minute) / 60
  return totals
}

export interface Remark {
  minute: number
  location: string
  note?: string
}

export interface PlacedRemark extends Remark {
  /** True x of the duty change on the grid. */
  anchorX: number
  /** x the rotated label is drawn from, after collision resolution. */
  labelX: number
}

/**
 * Spread rotated Remarks labels so they stay legible.
 *
 * Status changes cluster — a fuel stop is two changes 30 minutes apart, about
 * 15px of grid — but a rotated "Fredericksburg, VA" needs far more horizontal
 * room. Left unhandled the labels overlap into mush on any real trip.
 *
 * Two passes: push right while too close to the previous label, then clamp back
 * from the right edge. The leader line still points at the true `anchorX`, so
 * displacing a label never misreports when the change happened.
 */
export function placeRemarks(
  remarks: Remark[],
  dayStartMinute = 0,
  minSpacing = 46,
): PlacedRemark[] {
  const sorted = [...remarks].sort((a, b) => a.minute - b.minute)
  const placed: PlacedRemark[] = sorted.map((r) => {
    const anchorX = x(r.minute, dayStartMinute)
    return { ...r, anchorX, labelX: anchorX }
  })

  for (let i = 1; i < placed.length; i++) {
    const gap = placed[i].labelX - placed[i - 1].labelX
    if (gap < minSpacing) placed[i].labelX = placed[i - 1].labelX + minSpacing
  }

  const rightEdge = L.gridX + L.gridW
  for (let i = placed.length - 1; i >= 0; i--) {
    if (placed[i].labelX > rightEdge) placed[i].labelX = rightEdge
    if (i > 0 && placed[i].labelX - placed[i - 1].labelX < minSpacing) {
      placed[i - 1].labelX = placed[i].labelX - minSpacing
    }
  }

  return placed
}
