/**
 * Presentation helpers shared across features. No React, no DOM.
 *
 * Every formatter is total: a bad date, a non-finite number or an unknown time
 * zone comes back as a dash or the browser's own zone, never as a thrown
 * RangeError that takes the page down with it.
 */

const INVALID = '—'

function parse(iso: string): Date | null {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** `toLocaleString` throws on an unknown zone; fall back to the browser's. */
function inZone<T>(format: (timeZone?: string) => T, timeZone?: string): T {
  if (!timeZone) return format(undefined)
  try {
    return format(timeZone)
  } catch {
    return format(undefined)
  }
}

export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours)) return INVALID
  const total = Math.round(Math.max(0, hours) * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

export function formatMiles(miles: number): string {
  if (!Number.isFinite(miles)) return INVALID
  return `${Math.round(miles).toLocaleString()} mi`
}

export function formatClock(iso: string, timeZone?: string): string {
  const d = parse(iso)
  if (!d) return INVALID
  return inZone(
    (tz) =>
      d.toLocaleString(undefined, {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: tz,
      }),
    timeZone,
  )
}

/** "30 Jul 2026, 03:47" — a full moment without seconds, in the given zone. */
export function formatDateTime(iso: string, timeZone?: string): string {
  const d = parse(iso)
  if (!d) return INVALID
  return inZone(
    (tz) => d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }),
    timeZone,
  )
}

/**
 * The calendar date, "YYYY-MM-DD", of an instant in the given zone.
 *
 * Matches `LogDay.date`, so a stop can be filed under the sheet it appears on
 * regardless of the browser's own time zone. Empty for an unparseable input.
 */
export function formatIsoDate(iso: string, timeZone?: string): string {
  const d = parse(iso)
  if (!d) return ''
  return inZone((tz) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d)
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    return `${part('year')}-${part('month')}-${part('day')}`
  }, timeZone)
}

/** "Thu, Jul 30" — a day heading. */
export function formatDay(iso: string, timeZone?: string): string {
  const d = parse(iso)
  if (!d) return INVALID
  return inZone(
    (tz) =>
      d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: tz,
      }),
    timeZone,
  )
}

/** Hours to the quarter-hour precision the log sheet is written in. */
export function formatHours(hours: number): string {
  return Number.isFinite(hours) ? hours.toFixed(2) : INVALID
}

/** The form prints the date as three boxes: (month) (day) (year). */
export function formatSheetDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${m} / ${d} / ${y}` : iso
}
