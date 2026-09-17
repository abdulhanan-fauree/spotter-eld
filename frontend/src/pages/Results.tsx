import { ArrowLeft, Printer, RefreshCw, SearchX, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useTrip } from '@/api/hooks'
import type { Trip } from '@/api/types'
import { Button } from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { ResultsSkeleton } from '@/components/ui/Skeleton'
import { DUTY_ORDER, type DutyStatus } from '@/domain/duty'
import {
  formatDateTime,
  formatDuration,
  formatIsoDate,
  formatMiles,
  formatSheetDate,
} from '@/domain/format'
import { DeleteTripButton } from '@/features/history/DeleteTripButton'
import { ELDLogSheet } from '@/features/log/ELDLogSheet'
import { DutyMix } from '@/features/results/DutyMix'
import { Itinerary } from '@/features/results/Itinerary'
import { Playback } from '@/features/results/Playback'
import { RouteMap, type TruckMarker } from '@/features/results/RouteMap'
import {
  cumulativeMiles,
  distanceForMile,
  pointAtDistance,
  type LatLng,
} from '@/features/results/routeMath'
import { SummaryBar } from '@/features/results/SummaryBar'
import { buildTimeline, positionAt } from '@/features/results/timeline'
import { Violations } from '@/features/results/Violations'
import { useDocumentTitle } from '@/lib/documentTitle'
import { useTheme } from '@/lib/theme'

/** Playback runs the whole trip in this long, whatever its length. */
const PLAYBACK_MS = 45_000

export default function Results() {
  const { id } = useParams<{ id: string }>()
  const { data: trip, isLoading, error, refetch, isFetching } = useTrip(id)
  useDocumentTitle(trip ? `${trip.current_location} → ${trip.dropoff_location}` : 'Trip')

  if (isLoading) return <ResultsSkeleton />

  if (error || !trip) {
    // A 404 is final: the trip was deleted, or the link was never right.
    // Anything else may clear up on a retry.
    const gone = error?.status === 404
    return (
      <div className="mx-auto max-w-app px-6 py-16">
        <EmptyState
          icon={gone ? SearchX : TriangleAlert}
          title={gone ? 'This trip no longer exists' : 'Could not load this trip'}
          body={
            gone
              ? 'It may have been deleted. Your other trips are still in the history.'
              : error?.message ?? 'Something went wrong while loading it.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {!gone && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Try again
                </Button>
              )}
              <Link
                to="/trips"
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold hover:border-stone-400 dark:border-stone-700 dark:hover:border-stone-600"
              >
                Trip history
              </Link>
              <Link
                to="/"
                className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
              >
                Plan a new trip
              </Link>
            </div>
          }
        />
      </div>
    )
  }

  // Keyed so every piece of view state resets when the route changes trips.
  return <TripView key={trip.id} trip={trip} />
}

function TripView({ trip }: { trip: Trip }) {
  const navigate = useNavigate()
  const theme = useTheme()

  const [mapExpanded, setMapExpanded] = useState(false)
  const [activeStop, setActiveStop] = useState<number | null>(null)
  const [focusStop, setFocusStop] = useState<number | null>(null)
  const [selectedStop, setSelectedStop] = useState<number | null>(null)
  const [focusBounds, setFocusBounds] = useState<LatLng[] | null>(null)
  const [day, setDay] = useState(0)

  // ----- Playback ---------------------------------------------------------- //

  const geometry = trip.route_geometry
  const cum = useMemo(() => cumulativeMiles(geometry), [geometry])
  const timeline = useMemo(() => buildTimeline(trip.stops), [trip.stops])
  const tripStart = timeline[0]?.start ?? Date.parse(trip.start_datetime)
  const tripEnd = timeline[timeline.length - 1]?.end ?? tripStart

  const [time, setTime] = useState(tripStart)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!playing) return
    const rate = (tripEnd - tripStart) / PLAYBACK_MS // trip ms per wall-clock ms
    let last = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const dt = now - last
      last = now
      setTime((t) => Math.min(tripEnd, t + dt * rate))
      frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, tripStart, tripEnd])

  useEffect(() => {
    if (playing && time >= tripEnd) setPlaying(false)
  }, [playing, time, tripEnd])

  // The log sheet follows the playhead.
  useEffect(() => {
    const date = formatIsoDate(new Date(time).toISOString(), trip.timezone)
    const idx = trip.log_days.findIndex((d) => d.date === date)
    if (idx >= 0) setDay(idx)
  }, [time, trip.log_days, trip.timezone])

  const now = useMemo(() => positionAt(timeline, time), [timeline, time])

  const truck = useMemo<TruckMarker | null>(() => {
    if (geometry.length < 2) return null
    const along = pointAtDistance(
      geometry,
      cum,
      distanceForMile(now.mile, trip.summary.total_miles, cum),
    )
    // Parked at a stop: sit exactly on its marker rather than on the
    // simplified line, which can be a few hundred metres off.
    const parkedAt =
      now.stop && now.stop.lat != null && now.stop.lng != null
        ? ([now.stop.lat, now.stop.lng] as LatLng)
        : null
    return {
      point: parkedAt ?? along.point,
      bearing: along.bearing,
      status: now.status,
      mile: now.mile,
    }
  }, [geometry, cum, now, trip.summary.total_miles])

  /** Jump the playhead to a stop's arrival; used by the map, the list and the tabs. */
  const goToStop = (sequence: number) => {
    const stop = trip.stops.find((s) => s.sequence === sequence)
    if (!stop) return
    setPlaying(false)
    setTime(Date.parse(stop.arrive_at))
    setSelectedStop(sequence)
  }

  const selectDay = (index: number) => {
    setDay(index)
    const date = trip.log_days[index]?.date
    const dayStops = trip.stops.filter((s) => formatIsoDate(s.arrive_at, trip.timezone) === date)
    const points = dayStops
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => [s.lat!, s.lng!] as LatLng)
    setFocusBounds(points.length > 0 ? points : null)
    if (dayStops[0]) goToStop(dayStops[0].sequence)
  }

  const togglePlay = () => {
    if (!playing && time >= tripEnd) setTime(tripStart)
    setPlaying((p) => !p)
  }

  const restart = () => {
    setPlaying(false)
    setTime(tripStart)
  }

  // ----- Derived ----------------------------------------------------------- //

  const sheet = trip.log_days[day]

  // Hours in each duty status across the whole trip, for the mix bar.
  const dutyTotals = trip.log_days.reduce<Record<DutyStatus, number>>(
    (acc, d) => {
      for (const s of DUTY_ORDER) acc[s] += d.totals[s]
      return acc
    },
    { OFF: 0, SB: 0, D: 0, ON: 0 },
  )

  const hasPlayback = timeline.length > 0 && tripEnd > tripStart

  return (
    <div className="mx-auto max-w-app px-6 py-8">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 dark:hover:text-stone-200"
        >
          <ArrowLeft size={15} /> New trip
        </Link>
        <div className="flex items-center gap-2">
          <DeleteTripButton
            id={trip.id}
            labelled
            onDeleted={() => navigate('/trips', { replace: true })}
          />
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer size={14} /> Print logs
          </Button>
        </div>
      </div>

      <h1 className="mb-1 text-xl font-semibold tracking-tight">
        {trip.current_location} → {trip.pickup_location} → {trip.dropoff_location}
      </h1>
      <p className="mb-5 text-sm text-stone-500 dark:text-stone-400">
        Departs {formatDateTime(trip.start_datetime, trip.timezone)} · Home terminal time zone{' '}
        {trip.timezone} · Planned{' '}
        <time dateTime={trip.created_at}>{formatDateTime(trip.created_at)}</time>
      </p>

      <div className="sticky top-[57px] z-20 -mx-2 px-2 py-2 backdrop-blur-md">
        <SummaryBar
          summary={trip.summary}
          isCompliant={trip.is_compliant}
          violationCount={trip.violations.length}
          provider={trip.routing_provider}
          timeZone={trip.timezone}
        />
      </div>

      <Violations violations={trip.violations} timeZone={trip.timezone} />

      <DutyMix totals={dutyTotals} className="no-print mt-6" />

      <div
        className={[
          'no-print mt-6 grid gap-6',
          mapExpanded ? '' : 'lg:grid-cols-[1.15fr_1fr] 2xl:grid-cols-[1.5fr_1fr]',
        ].join(' ')}
      >
        <div className="space-y-3">
          <div
            className={[
              'overflow-hidden rounded-xl border border-stone-200 shadow-sm dark:border-stone-800',
              mapExpanded ? 'h-[420px] sm:h-[640px] xl:h-[720px]' : 'h-[360px] sm:h-[460px] xl:h-[560px]',
            ].join(' ')}
          >
            <RouteMap
              geometry={geometry}
              stops={trip.stops}
              totalMiles={trip.summary.total_miles}
              timeZone={trip.timezone}
              dark={theme === 'dark'}
              activeStop={activeStop}
              focusStop={focusStop}
              focusBounds={focusBounds}
              truck={hasPlayback ? truck : null}
              onHoverStop={setActiveStop}
              onSelectStop={goToStop}
              expanded={mapExpanded}
              onToggleExpand={() => setMapExpanded((e) => !e)}
            />
          </div>

          {hasPlayback && (
            <Playback
              start={tripStart}
              end={tripEnd}
              time={time}
              onTimeChange={(t) => {
                setPlaying(false)
                setTime(t)
              }}
              playing={playing}
              onTogglePlay={togglePlay}
              onRestart={restart}
              status={now.status}
              mile={now.mile}
              totalMiles={trip.summary.total_miles}
              stop={now.stop}
              next={now.next}
              stops={trip.stops}
              timeZone={trip.timezone}
            />
          )}
        </div>

        <div
          className={[
            'overflow-auto rounded-xl border border-stone-200 bg-white p-3 shadow-sm dark:border-stone-800 dark:bg-stone-900',
            mapExpanded ? 'max-h-[420px]' : 'max-h-[600px] xl:max-h-[700px]',
          ].join(' ')}
        >
          <h2 className="mb-2 px-2 text-sm font-semibold">Route instructions, stops and rests</h2>
          <Itinerary
            steps={trip.steps}
            stops={trip.stops}
            timeZone={trip.timezone}
            logDates={trip.log_days.map((d) => d.date)}
            activeStop={activeStop}
            currentStop={hasPlayback ? (now.stop?.sequence ?? null) : null}
            selectedStop={selectedStop}
            onHoverStop={setActiveStop}
            onSelectStop={(sequence) => {
              setFocusStop(sequence)
              goToStop(sequence)
            }}
          />
        </div>
      </div>

      <section className="mt-8">
        <div className="no-print mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-semibold">
            Daily log sheets ({trip.log_days.length})
          </h2>
          {trip.log_days.map((d, i) => (
            <button
              key={d.date}
              onClick={() => selectDay(i)}
              aria-current={i === day}
              title="Show this day's sheet, and frame its stops on the map"
              className={[
                'rounded-lg border px-3 py-1.5 text-left text-xs leading-tight transition',
                i === day
                  ? 'border-teal-600 bg-teal-600 text-white'
                  : 'border-stone-300 hover:border-teal-500 dark:border-stone-700',
              ].join(' ')}
            >
              <span className="block font-semibold">Day {d.day_index}</span>
              <span className={i === day ? 'text-teal-100' : 'text-stone-500 dark:text-stone-400'}>
                {formatMiles(d.miles_driving_today)} · {formatDuration(d.totals.D)} driving
              </span>
            </button>
          ))}
        </div>

        {/* `no-print`: the block below renders every sheet for printing, so
            without this the selected day is emitted twice — once here and once
            there — and the PDF gains a duplicate page. */}
        {sheet && (
          <div className="no-print rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <ELDLogSheet
              className="w-full"
              animate
              header={{
                date: formatSheetDate(sheet.date),
                from: trip.current_location,
                to: trip.dropoff_location,
                totalMilesDriving: Math.round(sheet.miles_driving_today),
                totalMileage: Math.round(sheet.miles_driving_today),
                carrierName: trip.carrier_name,
                mainOfficeAddress: trip.main_office_address,
                homeTerminalAddress: trip.home_terminal_address,
                truckNumber: trip.truck_number,
                trailerNumber: trip.trailer_number,
                driverName: trip.driver_name,
                shippingDocNo: trip.shipping_doc_no,
                shipperCommodity: trip.shipper_commodity,
              }}
              segments={sheet.segments}
              remarks={sheet.remarks}
              recap={sheet.recap}
            />
          </div>
        )}

        {/* Print takes every sheet, not just the selected one. */}
        <div className="hidden print:block">
          {trip.log_days.map((d) => (
            <div key={d.date} className="print-page">
              <ELDLogSheet
                className="w-full"
                header={{
                  date: formatSheetDate(d.date),
                  totalMilesDriving: Math.round(d.miles_driving_today),
                }}
                segments={d.segments}
                remarks={d.remarks}
                recap={d.recap}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
