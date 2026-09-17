/**
 * The trip as one narrative: turn-by-turn directions with the HOS stops spliced
 * in at their mile markers.
 *
 * This single component answers both "outputs route instructions" (Objective)
 * and "information regarding stops and rests" (Outputs).
 *
 * Stops are filed under day headings that use the log sheets' own numbering, so
 * "Day 3" here is the same sheet as the "Day 3" tab further down the page.
 */

import {
  ArrowRight,
  BedDouble,
  CircleDot,
  Coffee,
  Flag,
  Fuel,
  ChevronUp,
  MoreHorizontal,
  PackageCheck,
  PackageOpen,
  Truck,
} from 'lucide-react'
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'

import type { Step, Stop } from '@/api/types'
import { DUTY_COLOR } from '@/domain/duty'
import { formatClock, formatDay, formatDuration, formatIsoDate, formatMiles } from '@/domain/format'
import { STOP_TITLE, type StopKind } from '@/domain/stops'
import { type CollapsedEntry, collapseSteps, mergeItinerary } from './merge'

const STOP_ICON: Record<StopKind, ComponentType<{ size?: number; className?: string }>> = {
  pre_trip: CircleDot,
  pickup: PackageOpen,
  dropoff: PackageCheck,
  fuel: Fuel,
  break_30: Coffee,
  rest_10: BedDouble,
  restart_34: Flag,
}

export interface ItineraryProps {
  steps: Step[]
  stops: Stop[]
  timeZone?: string
  /** `LogDay.date` values in order, so day headings match the sheet tabs. */
  logDates?: string[]
  /** Hovered on the map or here. */
  activeStop?: number | null
  /** Where the truck is parked during playback. */
  currentStop?: number | null
  /** Scrolled into view when it changes (a marker click, a day tab). */
  selectedStop?: number | null
  onHoverStop?: (sequence: number | null) => void
  /** Clicking a stop centres the map on it. */
  onSelectStop?: (sequence: number) => void
  className?: string
}

export function Itinerary({
  steps,
  stops,
  timeZone,
  logDates = [],
  activeStop = null,
  currentStop = null,
  selectedStop = null,
  onHoverStop,
  onSelectStop,
  className,
}: ItineraryProps) {
  // Which collapsed runs the reader has opened. A cross-country route has ~90
  // instructions; showing them all buries the HOS stops, but a dead "22 more"
  // label is worse than one that opens.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (selectedStop == null) return
    listRef.current
      ?.querySelector(`[data-stop="${selectedStop}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selectedStop])

  const entries = collapseSteps(mergeItinerary(steps, stops), 3, expanded)
  const dayNumber = new Map(logDates.map((date, i) => [date, i + 1]))

  let stopNumber = 0

  const renderEntry = (entry: CollapsedEntry): ReactNode => {
    if (entry.type === 'gap') {
      const open = expanded.has(entry.key)
      return (
        <li key={entry.key}>
          <button
            type="button"
            onClick={() => toggle(entry.key)}
            aria-expanded={open}
            className="flex w-full items-center gap-3 rounded-lg py-1.5 pl-[42px] text-left text-xs text-stone-400 transition hover:text-teal-600 dark:text-stone-500 dark:hover:text-teal-400"
          >
            {open ? <ChevronUp size={14} /> : <MoreHorizontal size={14} />}
            <span>
              {open
                ? 'Hide directions'
                : `Show ${entry.hiddenCount} more directions · ${formatMiles(entry.distanceMi)}`}
            </span>
          </button>
        </li>
      )
    }

    if (entry.type === 'step') {
      return (
        <li
          key={entry.key}
          className="flex items-start gap-3 py-1.5 pl-[42px] text-sm text-stone-500 dark:text-stone-400"
        >
          <ArrowRight size={14} className="mt-0.5 shrink-0 opacity-60" />
          <span className="flex-1">{entry.instruction}</span>
          <span className="shrink-0 tabular-nums text-xs opacity-70">
            {formatMiles(entry.distanceMi)}
          </span>
        </li>
      )
    }

    const Icon = STOP_ICON[entry.kind]
    const colour = DUTY_COLOR[entry.status]
    const sequence = Number(entry.key.slice('stop-'.length))
    const active = activeStop === sequence
    const current = currentStop === sequence
    stopNumber += 1

    return (
      <li
        key={entry.key}
        data-stop={sequence}
        onMouseEnter={() => onHoverStop?.(sequence)}
        onMouseLeave={() => onHoverStop?.(null)}
        onClick={() => onSelectStop?.(sequence)}
        aria-current={current ? 'step' : undefined}
        className={[
          onSelectStop ? 'cursor-pointer' : '',
          'group flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors',
          current
            ? 'bg-teal-50/80 ring-1 ring-inset ring-teal-500/40 dark:bg-teal-950/30'
            : active
              ? 'bg-stone-100 dark:bg-stone-800/70'
              : 'hover:bg-stone-50 dark:hover:bg-stone-900/60',
        ].join(' ')}
      >
        <span
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
          style={{ backgroundColor: colour }}
          aria-hidden
        >
          <Icon size={14} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{STOP_TITLE[entry.kind]}</span>
            <span className="truncate text-sm text-stone-500 dark:text-stone-400">
              {entry.location}
            </span>
            {current && (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-teal-600 dark:text-teal-400">
                <Truck size={12} /> here now
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500 dark:text-stone-400">
            <span className="tabular-nums">{formatClock(entry.arriveAt, timeZone)}</span>
            <span>{formatDuration(entry.durationHr)}</span>
            <span className="tabular-nums">{formatMiles(entry.mile)}</span>
          </div>
        </div>

        <span className="mt-1 shrink-0 text-xs tabular-nums text-stone-400">{stopNumber}</span>
      </li>
    )
  }

  // Interleave a heading whenever a stop lands on a new calendar day (in the
  // home terminal zone, which is the zone the sheets are drawn in).
  const rows: ReactNode[] = []
  let currentDay: string | null = null
  let daysSeen = 0

  for (const entry of entries) {
    if (entry.type === 'stop') {
      const date = formatIsoDate(entry.arriveAt, timeZone)
      if (date !== currentDay) {
        currentDay = date
        daysSeen += 1
        rows.push(
          <li
            key={`day-${date}`}
            className="sticky top-0 z-10 -mx-1 mb-1 mt-3 flex items-baseline gap-2 rounded-md bg-white/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500 backdrop-blur first:mt-0 dark:bg-stone-900/95 dark:text-stone-400"
          >
            Day {dayNumber.get(date) ?? daysSeen}
            <span className="font-normal normal-case tracking-normal">
              {formatDay(entry.arriveAt, timeZone)}
            </span>
          </li>,
        )
      }
    }
    rows.push(renderEntry(entry))
  }

  return (
    <ol ref={listRef} className={className}>
      {rows}
    </ol>
  )
}

export default Itinerary
