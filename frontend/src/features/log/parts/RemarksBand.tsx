import { L, type Remark, hourX, placeRemarks, quarterTicks, x } from '../grid'

const TICKS = quarterTicks()

/**
 * The Remarks band: a tick row, then a slanted city/state label per duty change.
 *
 * Labels are anchored at the *end* of the text so they hang down-and-left from
 * the remarks line, as on guide pp.18-19. Anchoring at the start throws the
 * rotated text up into the grid, straight across the hour numbers.
 */
export function RemarksBand({
  top,
  remarks,
  dayStartMinute = 0,
}: {
  top: number
  remarks: Remark[]
  dayStartMinute?: number
}) {
  const placed = placeRemarks(remarks, dayStartMinute)

  return (
    <g>
      {Array.from({ length: 25 }, (_, h) => (
        <line key={h} x1={hourX(h)} y1={top - 6} x2={hourX(h)} y2={top} className="log-grid" />
      ))}
      {TICKS.map(({ minute, height }) => (
        <line key={minute} x1={x(minute)} y1={top - height * 0.5} x2={x(minute)} y2={top} className="log-tick" />
      ))}
      <line x1={L.gridX} y1={top} x2={L.gridX + L.gridW} y2={top} className="log-rule" />
      <text x={L.gridX - 8} y={top - 1} textAnchor="end" fontSize={7.5} className="log-label">
        REMARKS
      </text>

      {placed.map((r, i) => (
        <g key={`${r.minute}-${i}`}>
          <path
            d={`M ${r.anchorX.toFixed(2)} ${top} V ${top + 8} H ${r.labelX.toFixed(2)} V ${top + 14}`}
            className="log-grid"
          />
          <text
            x={r.labelX}
            y={top + 16}
            textAnchor="end"
            fontSize={8.5}
            className="log-label"
            transform={`rotate(-58 ${r.labelX} ${top + 16})`}
          >
            {r.location}
          </text>
        </g>
      ))}
    </g>
  )
}
