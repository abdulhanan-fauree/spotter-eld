/** Loading placeholders shaped like the content they replace — never a bare spinner. */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} aria-hidden />
}

export function ResultsSkeleton() {
  return (
    <div className="mx-auto max-w-app px-6 py-8" role="status" aria-label="Loading trip">
      <Skeleton className="h-7 w-96" />
      <Skeleton className="mt-2 h-4 w-56" />
      <Skeleton className="mt-5 h-24 w-full rounded-xl" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <Skeleton className="h-[460px] rounded-xl" />
        <div className="space-y-3 rounded-xl border border-stone-200 p-4 dark:border-stone-800">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="size-7 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="mt-8 h-[420px] w-full rounded-xl" />
    </div>
  )
}
