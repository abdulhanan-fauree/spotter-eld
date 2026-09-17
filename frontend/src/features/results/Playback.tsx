/**
 * Scrub or play the trip. The truck on the map, the highlighted stop in the
 * itinerary and the selected log sheet all follow the chosen moment, so the
 * three views read as one plan rather than three lists.
 */

import { Pause, Play, SkipBack } from 'lucide-react'

import type { Stop } from '@/api/types'
import { DUTY_COLOR, DUTY_LABEL, type DutyStatus } from '@/domain/duty'
import { formatClock, formatDateTime, formatDuration, formatMiles } from '@/domain/format'
import { STOP_TITLE } from '@/domain/stops'

export interface PlaybackProps {
  /** Epoch milliseconds. */
  start: number
  end: number
  time: number
  onTimeChange: (time: number) => void
  playing: boolean
  onTogglePlay: () => void
  onRestart: () => void
  /** Where the truck is at `time`. */
  status: DutyStatus
  mile: number
  totalMiles: number
  stop: Stop | null
  next: Stop | null
  /** Every stop, for the jump markers along the track. */
  stops: Stop[]
  timeZone?: string
  className?: string
}

const iso = (ms: number) => new Date(ms).toISOString()

export function Playback({
  start,
  end,
  time,
  onTimeChange,
  playing,
  onTogglePlay,
  onRestart,
  status,
  mile,
  totalMiles,
  stop,
  next,
  stops,
  timeZone,
  className = '',
}: PlaybackProps) {
  const span = Math.max(1, end - start)
  const pct = (t: number) => `${(((t - start) / span) * 100).toFixed(2)}%`

  const context = stop
    ? `${STOP_TITLE[stop.kind]}${stop.location ? ` · ${stop.location}` : ''}`
    : next
      ? `Next: ${STOP_TITLE[next.kind]} in ${formatDuration((Date.parse(next.arrive_at) - time) / 3_600_000)}`
      : 'Arrived'

  return (
    <section
      aria-label="Trip playback"
      className={`rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-stone-800 dark:bg-stone-900 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause' : 'Play the trip'}
            className="flex size-8 items-center justify-center rounded-full bg-teal-600 text-white transition hover:bg-teal-700"
          >
            {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={onRestart}
            aria-label="Back to start"
            title="Back to start"
            className="flex size-8 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <SkipBack size={15} />
          </button>
        </div>

        <div className="min-w-0 flex-1 leading-tight">
          <div className="font-semibold tabular-nums">{formatDateTime(iso(time), timeZone)}</div>
          <div className="truncate text-xs text-stone-500 dark:text-stone-400">{context}</div>
        </div>

        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white"
          style={{ backgroundColor: DUTY_COLOR[status] }}
        >
          {DUTY_LABEL[status]}
        </span>
        <span className="text-xs tabular-nums text-stone-500 dark:text-stone-400">
          {formatMiles(mile)} <span className="text-stone-400">/ {formatMiles(totalMiles)}</span>
        </span>
      </div>

      {/* The track: a native range input for the thumb and keyboard handling,
          with one jump marker per stop laid over it. */}
      <div className="relative mt-3 h-6">
        <input
          type="range"
          min={start}
          max={end}
          step={60_000}
          value={Math.round(time)}
          onChange={(e) => onTimeChange(Number(e.target.value))}
          aria-label="Trip time"
          className="absolute inset-x-0 top-1/2 h-1.5 w-full -translate-y-1/2 cursor-pointer accent-teal-600"
        />
        {stops.map((s) => (
          <button
            key={s.sequence}
            type="button"
            onClick={() => onTimeChange(Date.parse(s.arrive_at))}
            title={`${STOP_TITLE[s.kind]} · ${formatClock(s.arrive_at, timeZone)}`}
            aria-label={`Jump to ${STOP_TITLE[s.kind]}`}
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm transition hover:scale-150 dark:border-stone-900"
            style={{ left: pct(Date.parse(s.arrive_at)), backgroundColor: DUTY_COLOR[s.status] }}
          />
        ))}
      </div>

      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-stone-400">
        <span>{formatDateTime(iso(start), timeZone)}</span>
        <span>{formatDateTime(iso(end), timeZone)}</span>
      </div>
    </section>
  )
}

export default Playback
