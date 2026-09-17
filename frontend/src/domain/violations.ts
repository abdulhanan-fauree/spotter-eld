/**
 * Vocabulary for `Violation.kind`. Mirrors the rules `apps.hos.validate` checks
 * on the server, which re-derives every clock from the finished timeline.
 */

import type { Violation } from '@/api/types'

export const VIOLATION_LABEL: Record<string, string> = {
  '11_hour_driving': '11-hour driving limit',
  '14_hour_window': '14-hour duty window',
  '30_minute_break': '30-minute break',
  '70_hour_cycle': '70-hour / 8-day cycle',
}

/**
 * A readable name for a rule, falling back to a humanised key so a rule added
 * on the server never renders as raw `snake_case`.
 */
export function violationLabel(kind: string): string {
  return (
    VIOLATION_LABEL[kind] ?? kind.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  )
}

/** "11.50 h of 11 h". Every current rule is measured in hours. */
export function formatLimit(v: Pick<Violation, 'limit' | 'actual'>): string {
  return `${v.actual.toFixed(2)} h of ${v.limit} h`
}
