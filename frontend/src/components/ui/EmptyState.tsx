import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-stone-300 px-6 py-14 text-center dark:border-stone-700">
      <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-stone-100 text-stone-400 dark:bg-stone-800">
        <Icon size={20} />
      </span>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export default EmptyState
