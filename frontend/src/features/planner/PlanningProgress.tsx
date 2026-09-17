/**
 * What the server is doing during the ~5 seconds a plan takes.
 *
 * A single "Planning…" line for five seconds reads as a hang. These four stages
 * are the real pipeline (`services/planning.py`), advanced on the timings those
 * calls actually take; the last stage holds until the response lands, so the UI
 * never claims to have finished something it hasn't.
 */

import { Check, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

const STAGES = [
  { label: 'Finding your locations', afterMs: 0 },
  { label: 'Routing both legs', afterMs: 1200 },
  { label: 'Simulating hours of service', afterMs: 3000 },
  { label: 'Drawing daily log sheets', afterMs: 4200 },
] as const

export function PlanningProgress() {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const timers = STAGES.map((s, i) =>
      s.afterMs === 0 ? undefined : setTimeout(() => setStage(i), s.afterMs),
    )
    return () => timers.forEach((t) => t && clearTimeout(t))
  }, [])

  return (
    <ol className="mt-6 space-y-2" aria-live="polite">
      {STAGES.map((s, i) => {
        const done = i < stage
        const active = i === stage
        return (
          <li
            key={s.label}
            className={[
              'flex items-center gap-2.5 text-sm transition-colors',
              active ? 'text-stone-900 dark:text-stone-100' : '',
              done ? 'text-stone-400 dark:text-stone-500' : '',
              !done && !active ? 'text-stone-300 dark:text-stone-600' : '',
            ].join(' ')}
          >
            <span className="flex size-4 items-center justify-center">
              {done ? (
                <Check size={14} className="text-emerald-500" />
              ) : active ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <span className="size-1.5 rounded-full bg-current" />
              )}
            </span>
            {s.label}
          </li>
        )
      })}
    </ol>
  )
}

export default PlanningProgress
