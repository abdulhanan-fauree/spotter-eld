/**
 * The trip as a function of time, for playback.
 *
 * Built from the stops alone: while a stop lasts the truck is parked at its
 * mile in its duty status, and between one stop's departure and the next
 * arrival it is driving from one mile marker to the other. Linear interpolation
 * between the two is exact enough to move a marker along the route.
 */

import type { Stop } from '@/api/types'
import type { DutyStatus } from '@/domain/duty'

export interface TimelineSegment {
  /** Epoch milliseconds. */
  start: number
  end: number
  startMile: number
  endMile: number
  status: DutyStatus
  /** The stop the truck is parked at, or null while driving. */
  stop: Stop | null
}

const hasTimes = (s: Stop) =>
  !Number.isNaN(Date.parse(s.arrive_at)) && !Number.isNaN(Date.parse(s.depart_at))

export function buildTimeline(stops: Stop[]): TimelineSegment[] {
  // A stop with an unparseable time cannot be placed; leaving it out is better
  // than poisoning every interpolation after it with NaN.
  const ordered = stops
    .filter(hasTimes)
    .sort(
      (a, b) =>
        a.mile_marker - b.mile_marker || Date.parse(a.arrive_at) - Date.parse(b.arrive_at),
    )
  const segments: TimelineSegment[] = []

  ordered.forEach((stop, i) => {
    const arrive = Date.parse(stop.arrive_at)
    const depart = Date.parse(stop.depart_at)
    if (depart > arrive) {
      segments.push({
        start: arrive,
        end: depart,
        startMile: stop.mile_marker,
        endMile: stop.mile_marker,
        status: stop.status,
        stop,
      })
    }
    const next = ordered[i + 1]
    if (next) {
      const nextArrive = Date.parse(next.arrive_at)
      if (nextArrive > depart) {
        segments.push({
          start: depart,
          end: nextArrive,
          startMile: stop.mile_marker,
          endMile: next.mile_marker,
          status: 'D',
          stop: null,
        })
      }
    }
  })

  return segments
}

export interface TimelinePosition {
  mile: number
  status: DutyStatus
  /** Parked here, if anywhere. */
  stop: Stop | null
  /** The next stop ahead, if any. */
  next: Stop | null
}

function nextStopAfter(segments: TimelineSegment[], index: number): Stop | null {
  for (let j = index + 1; j < segments.length; j++) {
    if (segments[j].stop) return segments[j].stop
  }
  return null
}

export function positionAt(segments: TimelineSegment[], time: number): TimelinePosition {
  if (segments.length === 0) return { mile: 0, status: 'OFF', stop: null, next: null }

  const first = segments[0]
  const last = segments[segments.length - 1]
  if (time <= first.start) {
    return { mile: first.startMile, status: first.status, stop: first.stop, next: nextStopAfter(segments, 0) }
  }
  if (time >= last.end) {
    return { mile: last.endMile, status: last.status, stop: last.stop, next: null }
  }

  let i = segments.findIndex((s) => time >= s.start && time < s.end)
  if (i < 0) i = segments.length - 1
  const seg = segments[i]
  const f = seg.end > seg.start ? (time - seg.start) / (seg.end - seg.start) : 1
  return {
    mile: seg.startMile + (seg.endMile - seg.startMile) * f,
    status: seg.status,
    stop: seg.stop,
    next: nextStopAfter(segments, i),
  }
}
