/**
 * React Query bindings.
 *
 * Pages call these rather than `useQuery(api.…)` directly, so cache keys live in
 * one place and cannot drift between a read and the invalidation that should
 * follow it.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { type ApiError, api } from './client'
import type { Trip, TripInput, TripListRow } from './types'

export const tripKeys = {
  all: ['trips'] as const,
  detail: (id: string | number) => ['trips', String(id)] as const,
}

export function useTrip(id: string | undefined) {
  return useQuery<Trip, ApiError>({
    queryKey: tripKeys.detail(id ?? ''),
    queryFn: () => api.getTrip(id!),
    enabled: Boolean(id),
  })
}

export function useTripHistory() {
  return useQuery<TripListRow[], ApiError>({ queryKey: tripKeys.all, queryFn: api.listTrips })
}

/** Plans a trip and navigates to it. */
export function usePlanTrip() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation<Trip, ApiError, TripInput>({
    mutationFn: api.planTrip,
    onSuccess: (trip) => {
      queryClient.setQueryData(tripKeys.detail(trip.id), trip)
      queryClient.invalidateQueries({ queryKey: tripKeys.all })
      navigate(`/trips/${trip.id}`)
    },
  })
}

/**
 * Deletes a trip and drops it from the history list in place.
 *
 * The list is edited rather than invalidated so the row disappears the moment
 * the server confirms, with no refetch flicker. The detail entry is left to
 * expire on its own: removing it while the Results page still observes it would
 * trigger a refetch that 404s before the page has navigated away.
 */
export function useDeleteTrip() {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, number>({
    // Explicit arrow: React Query passes a context object as the second
    // argument, which the API function must not see.
    mutationFn: (id) => api.deleteTrip(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<TripListRow[]>(tripKeys.all, (rows) =>
        rows?.filter((row) => row.id !== id),
      )
    },
  })
}
