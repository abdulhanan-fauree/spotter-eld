/**
 * The violations behind a red compliance badge.
 *
 * `validate.py` re-derives every HOS clock from the finished timeline and
 * reports each breach with the rule, the moment, and actual-versus-limit
 * figures. A count alone tells the driver something is wrong; this tells them
 * what, and when.
 */

import { TriangleAlert } from 'lucide-react'

import type { Violation } from '@/api/types'
import { formatClock } from '@/domain/format'
import { formatLimit, violationLabel } from '@/domain/violations'

export interface ViolationsProps {
  violations: Violation[]
  timeZone?: string
}

export function Violations({ violations, timeZone }: ViolationsProps) {
  if (violations.length === 0) return null

  const heading =
    violations.length === 1
      ? '1 hours-of-service violation'
      : `${violations.length} hours-of-service violations`

  return (
    <section
      aria-labelledby="violations-heading"
      className="no-print mt-6 rounded-xl border border-red-200 bg-red-50/70 px-5 py-4 dark:border-red-900/60 dark:bg-red-950/30"
    >
      <h2
        id="violations-heading"
        className="flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-200"
      >
        <TriangleAlert size={16} />
        {heading}
      </h2>

      <ol className="mt-2 divide-y divide-red-200/70 dark:divide-red-900/50">
        {violations.map((v, i) => (
          <li
            key={`${v.kind}-${v.at}-${i}`}
            className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5 text-sm"
          >
            <span className="font-medium text-red-900 dark:text-red-100">
              {violationLabel(v.kind)}
            </span>
            <span className="min-w-0 flex-1 text-red-800/80 dark:text-red-200/80">{v.detail}</span>
            <span className="shrink-0 text-xs tabular-nums text-red-700/80 dark:text-red-300/80">
              {formatClock(v.at, timeZone)} · {formatLimit(v)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default Violations
