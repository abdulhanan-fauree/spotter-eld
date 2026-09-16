import { DUTY_LABEL, DUTY_ORDER, DUTY_ROW_NUMBER, type DutyStatus } from '@/domain/duty'
import { formatHours } from '@/domain/format'

import { GRID_BOTTOM, L, type Segment, dutyPath, hourX, quarterTicks, rowTop, totalsFor, x } from '../grid'

const TICKS = quarterTicks()

/**
 * The four-row grid, the drawn duty line, and the Total Hours column.
 *
 * The duty line is a single `<path>`: "Draw a solid line between the appropriate
 * time markers" (guide p.17). With `animate`, `pathLength="1"` normalises the
 * dash maths so the whole 24 hours can draw itself left-to-right regardless of
 * how long the path actually is.
 */
export function DutyGrid({
  segments,
  dayStartMinute = 0,
  animate = false,
}: {
  segments: Segment[]
  dayStartMinute?: number
  animate?: boolean
}) {
  const totals = totalsFor(segments)
  const grandTotal = DUTY_ORDER.reduce((sum, s) => sum + totals[s], 0)

  return (
    <g>
      {DUTY_ORDER.map((status: DutyStatus, i) => {
        const top = rowTop(status)
        return (
          <g key={status}>
            <rect
              x={L.gridX}
              y={top}
              width={L.gridW}
              height={L.rowH}
              className="log-grid"
              fill={i % 2 ? 'currentColor' : 'none'}
              fillOpacity={i % 2 ? 0.025 : 0}
            />
            <text x={L.gridX - 8} y={top + L.rowH / 2 - 1} textAnchor="end" fontSize={7.5} className="log-label">
              {DUTY_ROW_NUMBER[status]}. {DUTY_LABEL[status].split(' (')[0]}
            </text>
            {DUTY_LABEL[status].includes('(') && (
              <text x={L.gridX - 8} y={top + L.rowH / 2 + 7} textAnchor="end" fontSize={6} className="log-caption">
                (not driving)
              </text>
            )}

            {Array.from({ length: 25 }, (_, h) => (
              <line key={h} x1={hourX(h)} y1={top} x2={hourX(h)} y2={top + L.rowH} className="log-grid" />
            ))}
            {TICKS.map(({ minute, height }) => (
              <line key={minute} x1={x(minute)} y1={top} x2={x(minute)} y2={top + height} className="log-tick" />
            ))}

            {/* Totals stay in ink, as on the form. A `fill` attribute here would
                be silently overridden by `.log-value { fill: currentColor }` —
                CSS beats SVG presentation attributes. */}
            <text
              x={L.totalsX + L.totalsW / 2}
              y={top + L.rowH / 2 + 4}
              textAnchor="middle"
              fontSize={12}
              className="log-value"
            >
              {formatHours(totals[status])}
            </text>
          </g>
        )
      })}

      <path
        d={dutyPath(segments, dayStartMinute)}
        className="duty-line"
        pathLength={animate ? 1 : undefined}
        strokeDasharray={animate ? 1 : undefined}
        strokeDashoffset={animate ? 1 : undefined}
      />

      <line
        x1={L.totalsX + 14}
        y1={GRID_BOTTOM + 4}
        x2={L.totalsX + L.totalsW - 14}
        y2={GRID_BOTTOM + 4}
        className="log-rule"
      />
      <text x={L.totalsX + L.totalsW / 2} y={GRID_BOTTOM + 18} textAnchor="middle" fontSize={12.5} className="log-value">
        = {formatHours(grandTotal)}
      </text>
    </g>
  )
}
