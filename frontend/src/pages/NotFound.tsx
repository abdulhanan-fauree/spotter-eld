import { Compass } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

import EmptyState from '@/components/ui/EmptyState'
import { useDocumentTitle } from '@/lib/documentTitle'

/** Catch-all route. Without it an unknown URL renders the shell around nothing. */
export default function NotFound() {
  const { pathname } = useLocation()
  useDocumentTitle('Page not found')

  return (
    <div className="mx-auto max-w-app px-6 py-16">
      <EmptyState
        icon={Compass}
        title="Page not found"
        body={`Nothing lives at ${pathname}. Plan a new trip, or open one from your history.`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              to="/"
              className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Plan a trip
            </Link>
            <Link
              to="/trips"
              className="rounded-lg border border-stone-300 px-3.5 py-2 text-sm font-semibold hover:border-stone-400 dark:border-stone-700 dark:hover:border-stone-600"
            >
              Trip history
            </Link>
          </div>
        }
      />
    </div>
  )
}
