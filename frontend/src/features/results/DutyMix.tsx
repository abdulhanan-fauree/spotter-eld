/**
 * Hours in each duty status across the whole trip, as one proportional bar.
 *
 * The log sheets carry this per day and the itinerary per stop. Neither answers
 * "how much of this trip is driving versus resting" at a glance, which is the
 * first question a dispatcher asks of a multi-day plan.
 */

import { DUTY_COLOR, DUTY_LABEL, DUTY_ORDER, type DutyStatus } from '@/domain/duty'
import { formatDuration } from '@/domain/format'

export interface DutyMixProps {
  totals: Record<DutyStatus, number>
  className?: string
}

export function DutyMix({ totals, className = '' }: DutyMixProps) {
  const total = DUTY_ORDER.reduce((sum, s) => sum + totals[s], 0)
  if (total <= 0) return null

  const pct = (s: DutyStatus) => (totals[s] / total) * 100

  return (
    <section
      aria-label="Time in each duty status"
      className={`rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm dark:border-stone-800 dark:bg-stone-900 ${className}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Time on the trip</h2>
        <span className="text-xs tabular-nums text-stone-500 dark:text-stone-400">
          {formatDuration(total)} total
        </span>
      </div>

      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        {DUTY_ORDER.filter((s) => totals[s] > 0).map((s) => (
          <span
            key={s}
            className="h-full"
            style={{ width: `${pct(s)}%`, backgroundColor: DUTY_COLOR[s] }}
            title={`${DUTY_LABEL[s]} · ${formatDuration(totals[s])}`}
          />
        ))}
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
        {DUTY_ORDER.map((s) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: DUTY_COLOR[s] }}
              aria-hidden
            />
            <dt className="text-stone-500 dark:text-stone-400">{DUTY_LABEL[s]}</dt>
            <dd className="ml-auto font-medium tabular-nums">
              {formatDuration(totals[s])}{' '}
              <span className="font-normal text-stone-400">{Math.round(pct(s))}%</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default DutyMix
