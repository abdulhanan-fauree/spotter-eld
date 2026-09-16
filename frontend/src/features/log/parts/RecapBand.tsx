import { formatHours } from '@/domain/format'

import { L } from '../grid'

export interface Recap {
  on_duty_today: number
  total_last_7_days: number
  available_tomorrow: number
  total_last_8_days: number
}

/**
 * The Recap band at the foot of the form.
 *
 * A is 7 days and C is 8 because the form itself prints B's formula: tomorrow the
 * rolling window becomes [last 7 days incl. today] + tomorrow, so what is left is
 * `70 − A`. C is the current 8-day window — the number compared against 70, and
 * exactly the app's `current_cycle_used` input.
 */
const BOXES = [
  { key: 'A.', field: 'total_last_7_days', caption: ['Total hours on duty', 'last 7 days including today'] },
  { key: 'B.', field: 'available_tomorrow', caption: ['Total hours available', 'tomorrow, 70 hr. minus A'] },
  { key: 'C.', field: 'total_last_8_days', caption: ['Total hours on duty', 'last 8 days including today'] },
] as const

export const RECAP_H = 92

export function RecapBand({ y, recap }: { y: number; recap: Recap }) {
  return (
    <g>
      <rect x={20} y={y} width={L.width - 40} height={RECAP_H} className="log-frame" rx={3} />
      <text x={32} y={y + 16} fontSize={8} className="log-label">
        Recap: complete at end of day
      </text>
      <text x={32} y={y + 30} fontSize={7} className="log-caption">
        On duty hours today,
      </text>
      <text x={32} y={y + 39} fontSize={7} className="log-caption">
        total lines 3 &amp; 4
      </text>
      <text x={32} y={y + 60} fontSize={15} className="log-value">
        {formatHours(recap.on_duty_today)}
      </text>

      <text x={210} y={y + 16} fontSize={8} className="log-label">
        70 Hour / 8 Day Drivers
      </text>
      {BOXES.map((box, i) => (
        <g key={box.key} transform={`translate(${210 + i * 250}, 0)`}>
          <text x={0} y={y + 34} fontSize={8} className="log-label">
            {box.key}
          </text>
          <text x={16} y={y + 34} fontSize={7} className="log-caption">
            {box.caption[0]}
          </text>
          <text x={16} y={y + 43} fontSize={7} className="log-caption">
            {box.caption[1]}
          </text>
          <text x={16} y={y + 64} fontSize={15} className="log-value">
            {formatHours(recap[box.field])}
          </text>
        </g>
      ))}

      <text x={32} y={y + 84} fontSize={6.5} className="log-caption">
        *If you took 34 consecutive hours off duty you have 70 hours available.
      </text>
      <text x={L.width - 32} y={y + 84} textAnchor="end" fontSize={6.5} className="log-caption">
        I certify that these entries are true and correct.
      </text>
    </g>
  )
}
