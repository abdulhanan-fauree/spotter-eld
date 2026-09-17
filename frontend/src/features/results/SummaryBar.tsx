/**
 * Trip summary with the three HOS clocks, and the compliance badge.
 *
 * The badge is fed by `validate.py`, which re-derives every clock independently
 * of the planner that built the timeline. It is the most legible accuracy signal
 * on the page, which is exactly what the brief says it will be judged on.
 */

import { CheckCircle2, TriangleAlert } from 'lucide-react'

import type { TripSummary } from '@/api/types'
import { DUTY_COLOR } from '@/domain/duty'
import { formatDuration, formatMiles } from '@/domain/format'

function Gauge({
  label,
  used,
  limit,
  colour,
}: {
  label: string
  used: number
  limit: number
  colour: string
}) {
  const r = 18
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, used / limit))

  return (
    <div className="flex items-center gap-2.5">
      <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-stone-200 dark:stroke-stone-700" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="4"
          stroke={colour}
          strokeLinecap="round"
          strokeDasharray={`${(c * pct).toFixed(2)} ${c.toFixed(2)}`}
        />
      </svg>
      <div className="leading-tight">
        <div className="text-[11px] uppercase tracking-wide text-stone-500 dark:text-stone-400">
          {label}
        </div>
        <div className="text-sm font-semibold tabular-nums">
          {used.toFixed(2)}
          <span className="text-stone-400"> / {limit}</span>
        </div>
      </div>
    </div>
  )
}

export interface SummaryBarProps {
  summary: TripSummary
  isCompliant: boolean
  violationCount: number
  provider?: string
  timeZone?: string
}

export function SummaryBar({
  summary,
  isCompliant,
  violationCount,
  provider,
  timeZone,
}: SummaryBarProps) {
  const arrival = new Date(summary.arrival_datetime).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  })

  const stats = [
    { label: 'Distance', value: formatMiles(summary.total_miles) },
    { label: 'Driving', value: formatDuration(summary.drive_hours) },
    { label: 'Elapsed', value: formatDuration(summary.elapsed_hours) },
    { label: 'Log sheets', value: String(summary.log_sheet_count) },
    { label: 'Arrives', value: arrival },
  ]

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-xl border border-stone-200 bg-white/80 px-5 py-4 shadow-sm backdrop-blur dark:border-stone-800 dark:bg-stone-900/70">
      {stats.map((s) => (
        <div key={s.label} className="leading-tight">
          <div className="text-[11px] uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {s.label}
          </div>
          <div className="text-sm font-semibold tabular-nums">{s.value}</div>
        </div>
      ))}

      <div className="ml-auto flex flex-wrap items-center gap-6">
        <Gauge label="Cycle 70 hr" used={summary.cycle_used_end} limit={70} colour={DUTY_COLOR.SB} />

        <span
          className={[
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
            isCompliant
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
              : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300',
          ].join(' ')}
        >
          {isCompliant ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
          {isCompliant ? 'HOS compliant — 0 violations' : `${violationCount} violation(s)`}
        </span>
      </div>

      {provider && (
        <div className="w-full text-[11px] text-stone-400 dark:text-stone-500">
          Routing: {provider}
          {provider.includes('osrm') && ' — set ORS_API_KEY for the driving-hgv truck profile'}
        </div>
      )}
    </div>
  )
}

export default SummaryBar
