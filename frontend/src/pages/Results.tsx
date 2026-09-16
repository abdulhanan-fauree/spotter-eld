import { ArrowLeft, Printer, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useTrip } from '@/api/hooks'
import { formatDuration, formatMiles } from '@/domain/format'
import { ELDLogSheet } from '@/features/log/ELDLogSheet'
import { Itinerary } from '@/features/results/Itinerary'
import { RouteMap } from '@/features/results/RouteMap'
import { SummaryBar } from '@/features/results/SummaryBar'
import EmptyState from '@/components/ui/EmptyState'
import { ResultsSkeleton } from '@/components/ui/Skeleton'
import { resolveTheme } from '@/lib/theme'

/** The form prints the date as three separate boxes: (month) (day) (year). */
function formatSheetDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${m} / ${d} / ${y}`
}

export default function Results() {
  const { id } = useParams<{ id: string }>()
  const [activeStop, setActiveStop] = useState<number | null>(null)
  const [focusStop, setFocusStop] = useState<number | null>(null)
  const [day, setDay] = useState(0)

  const { data: trip, isLoading, error } = useTrip(id)

  if (isLoading) return <ResultsSkeleton />

  if (error || !trip) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16">
        <EmptyState
          icon={TriangleAlert}
          title="Could not load this trip"
          body="It may have been removed, or the backend may not be running."
          action={
            <Link
              to="/"
              className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Plan a new trip
            </Link>
          }
        />
      </div>
    )
  }

  const sheet = trip.log_days[day]

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="no-print mb-5 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-200">
          <ArrowLeft size={15} /> New trip
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-slate-400 dark:border-slate-700"
        >
          <Printer size={15} /> Print logs
        </button>
      </div>

      <h1 className="mb-1 text-xl font-semibold tracking-tight">
        {trip.current_location} → {trip.pickup_location} → {trip.dropoff_location}
      </h1>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        Home terminal time zone: {trip.timezone}
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

      <div className="no-print mt-6 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="h-[460px] overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
          <RouteMap
            geometry={trip.route_geometry}
            stops={trip.stops}
            dark={resolveTheme() === 'dark'}
            activeStop={activeStop}
            focusStop={focusStop}
            onHoverStop={setActiveStop}
          />
        </div>
        <div className="max-h-[460px] overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 px-2 text-sm font-semibold">Route instructions, stops and rests</h2>
          <Itinerary
            steps={trip.steps}
            stops={trip.stops}
            timeZone={trip.timezone}
            activeStop={activeStop}
            onHoverStop={setActiveStop}
            onSelectStop={setFocusStop}
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
              onClick={() => setDay(i)}
              aria-current={i === day}
              className={[
                'rounded-lg border px-3 py-1.5 text-left text-xs leading-tight transition',
                i === day
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-300 hover:border-blue-500 dark:border-slate-700',
              ].join(' ')}
            >
              <span className="block font-semibold">Day {d.day_index}</span>
              <span className={i === day ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}>
                {formatMiles(d.miles_driving_today)} · {formatDuration(d.totals.D)} driving
              </span>
            </button>
          ))}
        </div>

        {sheet && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
