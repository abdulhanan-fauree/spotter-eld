/**
 * Merge turn-by-turn directions with HOS stops into one ordered narrative.
 *
 * The brief's Objective line asks the app to output "route instructions"; the
 * Outputs bullets ask for "information regarding stops and rests". Both are the
 * same journey, so presenting them as two disconnected lists is a worse answer
 * than interleaving them:
 *
 *     ↰  Merge onto I-40 E                          412 mi
 *     ⛽ FUEL STOP — Amarillo, TX      mile 1,000 · 30 min on duty
 *     ↱  Take exit 76 toward I-44 E                  88 mi
 *     🛏 10-HOUR REST — Oklahoma City, OK            sleeper berth
 *
 * `Step.mile_marker` and `Stop.mile_marker` are the same axis by construction —
 * both are cumulative miles from the start of the trip — so the merge is one
 * sort. Designing the two payloads to share that field is what makes this cheap.
 */

import type { Step, Stop } from '@/api/types'
import type { DutyStatus } from '@/domain/duty'
import type { StopKind } from '@/domain/stops'

export interface ItineraryStep {
  type: 'step'
  key: string
  mile: number
  instruction: string
  distanceMi: number
}

export interface ItineraryStop {
  type: 'stop'
  key: string
  mile: number
  kind: StopKind
  status: DutyStatus
  label: string
  location: string
  arriveAt: string
  departAt: string
  durationHr: number
  lat: number | null
  lng: number | null
}

export type ItineraryEntry = ItineraryStep | ItineraryStop

export function mergeItinerary(steps: Step[], stops: Stop[]): ItineraryEntry[] {
  const entries: ItineraryEntry[] = [
    ...steps.map<ItineraryStep>((s) => ({
      type: 'step',
      key: `step-${s.sequence}`,
      mile: s.mile_marker,
      instruction: s.instruction,
      distanceMi: s.distance_mi,
    })),
    ...stops.map<ItineraryStop>((s) => ({
      type: 'stop',
      key: `stop-${s.sequence}`,
      mile: s.mile_marker,
      kind: s.kind,
      status: s.status,
      label: s.label,
      location: s.location,
      arriveAt: s.arrive_at,
      departAt: s.depart_at,
      durationHr: s.duration_hr,
      lat: s.lat,
      lng: s.lng,
    })),
  ]

  // Stable sort by mile; where a stop and a step coincide, the stop wins — you
  // arrive somewhere before you are told where to turn next.
  return entries.sort((a, b) => {
    if (a.mile !== b.mile) return a.mile - b.mile
    if (a.type === b.type) return 0
    return a.type === 'stop' ? -1 : 1
  })
}

/**
 * Collapse long runs of turn-by-turn steps.
 *
 * A cross-country route has ~90 instructions, most of them "Continue onto I-70 E"
 * for 200 miles. Showing every one buries the HOS stops, which are the part this
 * app exists to compute. Keeps the first `keep` steps after each stop and
 * summarises the rest.
 */
export interface ItineraryGap {
  type: 'gap'
  key: string
  mile: number
  hiddenCount: number
  distanceMi: number
}

export type CollapsedEntry = ItineraryEntry | ItineraryGap

export function collapseSteps(
  entries: ItineraryEntry[],
  keep = 3,
  expanded: ReadonlySet<string> = new Set(),
): CollapsedEntry[] {
  const out: CollapsedEntry[] = []
  let run: ItineraryStep[] = []

  const flush = () => {
    if (run.length === 0) return
    const hidden = run.slice(keep)
    const key = hidden.length > 0 ? `gap-${hidden[0].key}` : ''

    if (hidden.length === 0 || expanded.has(key)) {
      out.push(...run)
      if (hidden.length > 0) {
        out.push({
          type: 'gap',
          key,
          mile: hidden[0].mile,
          hiddenCount: hidden.length,
          distanceMi: hidden.reduce((sum, s) => sum + s.distanceMi, 0),
        })
      }
    } else {
      out.push(...run.slice(0, keep))
      out.push({
        type: 'gap',
        key,
        mile: hidden[0].mile,
        hiddenCount: hidden.length,
        distanceMi: hidden.reduce((sum, s) => sum + s.distanceMi, 0),
      })
    }
    run = []
  }

  for (const e of entries) {
    if (e.type === 'step') run.push(e)
    else {
      flush()
      out.push(e)
    }
  }
  flush()
  return out
}
