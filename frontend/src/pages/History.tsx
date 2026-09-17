import { CheckCircle2, ClipboardList, RefreshCw, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useTripHistory } from '@/api/hooks'
import { Button } from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDateTime, formatDuration, formatMiles } from '@/domain/format'
import { DeleteTripButton } from '@/features/history/DeleteTripButton'
import { useDocumentTitle } from '@/lib/documentTitle'

export default function History() {
  const { data, isLoading, error, refetch, isFetching } = useTripHistory()
  const count = data?.length ?? 0
  useDocumentTitle('Trip history')

  return (
    <div className="mx-auto max-w-app px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Trip history</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Every plan is saved and re-openable at a permanent link.
          </p>
        </div>
        {count > 0 && (
          <span className="text-sm tabular-nums text-stone-500 dark:text-stone-400">
            {count} {count === 1 ? 'trip' : 'trips'}
          </span>
        )}
      </header>

      <div className="mt-6 space-y-2">
        {isLoading &&
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}

        {error && !isLoading && (
          <EmptyState
            icon={TriangleAlert}
            title="Could not load your trips"
            body={error.message}
            action={
              <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Try again
              </Button>
            }
          />
        )}

        {data?.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title="No trips yet"
            body="Plan a trip and it will appear here with its route, stops and log sheets."
            action={
              <Link
                to="/"
                className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Plan a trip
              </Link>
            }
          />
        )}

        {data && data.length > 0 && (
          <ul className="space-y-2">
            {data.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white pr-2 transition hover:border-teal-400 hover:shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:hover:border-teal-500"
              >
                <Link
                  to={`/trips/${t.id}`}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-x-8 gap-y-2 rounded-l-xl px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {t.current_location} → {t.pickup_location} → {t.dropoff_location}
                    </div>
                    <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                      <time dateTime={t.created_at}>{formatDateTime(t.created_at)}</time>
                      {' · '}
                      {t.current_cycle_used} h cycle used at start
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm tabular-nums">
                    <span>{formatMiles(t.total_miles)}</span>
                    <span className="text-stone-500">{formatDuration(t.drive_hours)} driving</span>
                    <span className="text-stone-500">
                      {t.log_sheet_count} {t.log_sheet_count === 1 ? 'sheet' : 'sheets'}
                    </span>
                    <span
                      className={[
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                        t.is_compliant
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300',
                      ].join(' ')}
                    >
                      {t.is_compliant ? <CheckCircle2 size={13} /> : <TriangleAlert size={13} />}
                      {t.is_compliant ? 'Compliant' : 'Violations'}
                    </span>
                  </div>
                </Link>

                <DeleteTripButton id={t.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
