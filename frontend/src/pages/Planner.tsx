import { FileText, Fuel, Route } from 'lucide-react'

import { usePlanTrip } from '@/api/hooks'
import PlanningProgress from '@/features/planner/PlanningProgress'
import TripForm from '@/features/planner/TripForm'
import { useDocumentTitle } from '@/lib/documentTitle'

export default function Planner() {
  const plan = usePlanTrip()
  useDocumentTitle('Plan a trip')

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Plan a trip</h1>
        <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
          Route, stops and rests, and a drawn FMCSA log sheet for every day of the trip.
        </p>
      </header>

      <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <TripForm
          onSubmit={(input) => plan.mutate(input)}
          pending={plan.isPending}
          error={plan.error?.status === 400 ? null : plan.error?.message ?? null}
          fieldErrors={plan.error?.fields}
        />

        {plan.isPending && <PlanningProgress />}
      </div>

      {/* States the three outputs plainly, and stops the page bottoming out in
          dead space on a tall viewport. */}
      <ul className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: Route,
            title: 'Route instructions',
            body: 'Turn-by-turn directions with every stop and rest spliced in at its mile marker.',
          },
          {
            icon: Fuel,
            title: 'Stops and rests',
            body: 'Fuel every 1,000 miles, the 30-minute break, 10-hour resets and 34-hour restarts.',
          },
          {
            icon: FileText,
            title: 'Daily log sheets',
            body: 'One drawn FMCSA grid per calendar day, totalling exactly 24 hours.',
          },
        ].map((f) => (
          <li
            key={f.title}
            className="rounded-xl border border-stone-200 bg-white/60 p-4 dark:border-stone-800 dark:bg-stone-900/40"
          >
            <f.icon size={17} className="mb-2 text-teal-600 dark:text-teal-400" />
            <h2 className="text-sm font-semibold">{f.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
              {f.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
