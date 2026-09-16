/**
 * The trip as one narrative: turn-by-turn directions with the HOS stops spliced
 * in at their mile markers.
 *
 * This single component answers both "outputs route instructions" (Objective)
 * and "information regarding stops and rests" (Outputs).
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
} from 'lucide-react'
import { useState, type ComponentType } from 'react'

import type { Step, Stop } from '@/api/types'
import { DUTY_COLOR } from '@/domain/duty'
import { formatClock, formatDuration, formatMiles } from '@/domain/format'
import { STOP_TITLE, type StopKind } from '@/domain/stops'
import { collapseSteps, mergeItinerary } from './merge'

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
  activeStop?: number | null
  onHoverStop?: (sequence: number | null) => void
  /** Clicking a stop centres the map on it. */
  onSelectStop?: (sequence: number) => void
  className?: string
}

export function Itinerary({
  steps,
  stops,
  timeZone,
  activeStop = null,
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
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const entries = collapseSteps(mergeItinerary(steps, stops), 3, expanded)
  let stopNumber = 0

  return (
    <ol className={className}>
      {entries.map((entry) => {
        if (entry.type === 'gap') {
          const open = expanded.has(entry.key)
          return (
            <li key={entry.key}>
              <button
                type="button"
                onClick={() => toggle(entry.key)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 rounded-lg py-1.5 pl-[42px] text-left text-xs text-slate-400 transition hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400"
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
              className="flex items-start gap-3 py-1.5 pl-[42px] text-sm text-slate-500 dark:text-slate-400"
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
        stopNumber += 1

        return (
          <li
            key={entry.key}
            onMouseEnter={() => onHoverStop?.(sequence)}
            onMouseLeave={() => onHoverStop?.(null)}
            onClick={() => onSelectStop?.(sequence)}
            className={[
              onSelectStop ? 'cursor-pointer' : '',
              'group flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors',
              active
                ? 'bg-slate-100 dark:bg-slate-800/70'
                : 'hover:bg-slate-50 dark:hover:bg-slate-900/60',
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
                <span className="truncate text-sm text-slate-500 dark:text-slate-400">
                  {entry.location}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="tabular-nums">{formatClock(entry.arriveAt, timeZone)}</span>
                <span>{formatDuration(entry.durationHr)}</span>
                <span className="tabular-nums">{formatMiles(entry.mile)}</span>
              </div>
            </div>

            <span className="mt-1 shrink-0 text-xs tabular-nums text-slate-400">{stopNumber}</span>
          </li>
        )
      })}
    </ol>
  )
}

export default Itinerary
