/**
 * A Driver's Daily Log sheet, drawn as SVG.
 *
 * Laid out to match the blank form supplied with the brief — a richer variant
 * than the FMCSA specimen on guide p.19: it adds From/To, a second mileage box,
 * the Home Terminal Address, the Shipping Documents block and the Recap band.
 * The *grid* is validated against pp.18-19.
 *
 * SVG rather than canvas: it prints crisply, scales to any zoom, exports to PDF
 * cleanly, and every drawn segment stays a real DOM node we can hang a tooltip
 * on. Canvas gives up all four.
 *
 * This file is deliberately only composition and layout arithmetic; each band of
 * the form lives in `./parts`.
 */

import { ROUTE_INK } from '@/domain/duty'

import { GRID_BOTTOM, L, type Remark, type Segment, hourLabels, hourX } from './grid'
import { DutyGrid } from './parts/DutyGrid'
import { RECAP_H, RecapBand, type Recap } from './parts/RecapBand'
import { RemarksBand } from './parts/RemarksBand'
import { SheetHeader, type LogSheetHeader } from './parts/SheetHeader'
import { Field, HourScale } from './parts/primitives'

export type { LogSheetHeader, Recap }

export interface ELDLogSheetProps {
  header: LogSheetHeader
  segments: Segment[]
  remarks?: Remark[]
  recap?: Recap
  dayStartMinute?: number
  /** Draws the duty line in left-to-right. Off for print and for tests. */
  animate?: boolean
  className?: string
}

/**
 * Vertical budget below the grid. Remarks labels are slanted at 58°, so a
 * ~20-character place name occupies roughly `100 * sin(58°)` ≈ 85px of height.
 * Reserving that and placing everything after it relatively is what stops the
 * sheet developing a dead zone in the middle.
 */
const REMARKS_BAND_H = 96

const SHEET_CSS = `
  .log-rule   { stroke: currentColor; stroke-width: .8; opacity: .55; }
  .log-grid   { stroke: currentColor; stroke-width: .7; opacity: .45; fill: none; }
  .log-tick   { stroke: currentColor; stroke-width: .6; opacity: .38; }
  .log-frame  { stroke: currentColor; stroke-width: 1.1; fill: none; opacity: .75; }
  .log-caption{ fill: currentColor; opacity: .62; letter-spacing: .02em; }
  .log-label  { fill: currentColor; opacity: .85; }
  .log-value  { fill: currentColor; font-weight: 600; }
  .log-title  { fill: currentColor; font-weight: 700; }
  .log-caption, .log-label, .log-value, .log-title {
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .duty-line  { fill: none; stroke: ${ROUTE_INK}; stroke-width: 2.1;
                stroke-linejoin: miter; stroke-linecap: butt; }
`

const ANIMATION_CSS = `
  .duty-line { animation: drawDuty 1.6s ease-out forwards; }
  @keyframes drawDuty { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
`

export function ELDLogSheet({
  header,
  segments,
  remarks = [],
  recap,
  dayStartMinute = 0,
  animate = false,
  className,
}: ELDLogSheetProps) {
  const labels = hourLabels()
  const remarksTop = GRID_BOTTOM + L.hourLabelH + 10
  const shippingY = remarksTop + REMARKS_BAND_H + 30
  const recapY = shippingY + 30
  const height = recapY + RECAP_H + 16

  return (
    <svg
      viewBox={`0 0 ${L.width} ${height}`}
      className={className}
      role="img"
      aria-label={`Driver's daily log for ${header.date}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <style>
        {SHEET_CSS}
        {animate ? ANIMATION_CSS : ''}
        {`@media print { .duty-line { animation: none !important; stroke: #000; } }`}
      </style>

      <SheetHeader header={header} />

      <HourScale y={L.gridY - 5} labels={labels} hourX={hourX} />
      <text x={L.totalsX + L.totalsW / 2} y={L.gridY - 12} textAnchor="middle" fontSize={7} className="log-caption">
        Total
      </text>
      <text x={L.totalsX + L.totalsW / 2} y={L.gridY - 4} textAnchor="middle" fontSize={7} className="log-caption">
        Hours
      </text>

      <DutyGrid segments={segments} dayStartMinute={dayStartMinute} animate={animate} />

      <HourScale y={GRID_BOTTOM + 10} labels={labels} hourX={hourX} />
      <RemarksBand top={remarksTop} remarks={remarks} dayStartMinute={dayStartMinute} />

      <Field x={20} y={shippingY} w={230} label="DVL or Manifest No." value={header.shippingDocNo} />
      <Field x={270} y={shippingY} w={300} label="Shipper &amp; Commodity" value={header.shipperCommodity} />
      <text x={610} y={shippingY - 12} fontSize={7} className="log-caption">
        Enter name of place you reported and where released from work and when and
      </text>
      <text x={610} y={shippingY - 2} fontSize={7} className="log-caption">
        where each change of duty status occurred. Use time standard of home terminal.
      </text>

      {recap && <RecapBand y={recapY} recap={recap} />}
    </svg>
  )
}

export default ELDLogSheet
