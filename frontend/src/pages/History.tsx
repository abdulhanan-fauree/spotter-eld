import { CheckCircle2, ClipboardList, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useTripHistory } from '@/api/hooks'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDuration, formatMiles } from '@/domain/format'

export default function History() {
  const { data, isLoading } = useTripHistory()

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Trip history</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Every plan is saved and re-openable at a permanent link.
      </p>

      <div className="mt-6 space-y-2">
        {isLoading &&
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}

        {data?.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title="No trips yet"
            body="Plan a trip and it will appear here with its route, stops and log sheets."
            action={
              <Link
                to="/"
                className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Plan a trip
              </Link>
            }
          />
        )}

        {data?.map((t) => (
          <Link
            key={t.id}
            to={`/trips/${t.id}`}
            className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border border-slate-200 bg-white px-5 py-4 transition hover:border-blue-400 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {t.current_location} → {t.pickup_location} → {t.dropoff_location}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {new Date(t.created_at).toLocaleString()}
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm tabular-nums">
              <span>{formatMiles(t.total_miles)}</span>
              <span className="text-slate-500">{formatDuration(t.drive_hours)} driving</span>
              <span className="text-slate-500">{t.log_sheet_count} sheets</span>
              <span
                className={
                  t.is_compliant
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }
              >
                {t.is_compliant ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
