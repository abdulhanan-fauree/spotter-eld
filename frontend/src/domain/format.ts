/** Presentation helpers shared across features. No React, no DOM. */

export function formatDuration(hours: number): string {
  const total = Math.round(hours * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

export function formatMiles(miles: number): string {
  return `${Math.round(miles).toLocaleString()} mi`
}

export function formatClock(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  })
}

/** Hours to the quarter-hour precision the log sheet is written in. */
export function formatHours(hours: number): string {
  return hours.toFixed(2)
}

/** The form prints the date as three boxes: (month) (day) (year). */
export function formatSheetDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${m} / ${d} / ${y}`
}
