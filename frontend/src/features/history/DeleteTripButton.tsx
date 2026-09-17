/**
 * Two-step delete: the first click asks, the second removes.
 *
 * Inline rather than a modal so the row being deleted stays in view, and it
 * disarms on its own so a stray click never leaves a live "Delete" button lying
 * around. Used on each history row and in the Results header.
 */

import { Loader2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useDeleteTrip } from '@/api/hooks'

export interface DeleteTripButtonProps {
  id: number
  /** Called once the server has confirmed the deletion. */
  onDeleted?: () => void
  /** Show the word "Delete" beside the icon rather than icon-only. */
  labelled?: boolean
  className?: string
}

const DISARM_AFTER_MS = 5000

export function DeleteTripButton({
  id,
  onDeleted,
  labelled = false,
  className = '',
}: DeleteTripButtonProps) {
  const [armed, setArmed] = useState(false)
  const remove = useDeleteTrip()

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), DISARM_AFTER_MS)
    return () => clearTimeout(t)
  }, [armed])

  if (remove.isPending) {
    return (
      <span
        role="status"
        className={`inline-flex items-center gap-1.5 px-2 text-xs text-stone-400 ${className}`}
      >
        <Loader2 size={14} className="animate-spin" /> Deleting…
      </span>
    )
  }

  if (armed) {
    return (
      <span
        role="group"
        aria-label="Confirm deletion"
        className={`inline-flex items-center gap-1.5 text-xs ${className}`}
      >
        <span className="text-stone-600 dark:text-stone-300">Delete this trip?</span>
        <button
          type="button"
          onClick={() =>
            // Disarm on failure so the message renders under the idle button
            // and the reader can try again.
            remove.mutate(id, { onSuccess: onDeleted, onError: () => setArmed(false) })
          }
          className="rounded-md bg-red-600 px-2 py-1 font-semibold text-white transition hover:bg-red-700"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="rounded-md px-2 py-1 text-stone-500 transition hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          Cancel
        </button>
      </span>
    )
  }

  return (
    <span className={`inline-flex flex-col items-end ${className}`}>
      <button
        type="button"
        onClick={() => setArmed(true)}
        aria-label={labelled ? undefined : 'Delete trip'}
        title="Delete trip"
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-stone-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
      >
        <Trash2 size={15} />
        {labelled && 'Delete'}
      </button>
      {remove.isError && (
        <span className="text-[11px] text-red-600 dark:text-red-400">{remove.error.message}</span>
      )}
    </span>
  )
}

export default DeleteTripButton
