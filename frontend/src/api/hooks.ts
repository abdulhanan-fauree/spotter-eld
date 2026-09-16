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
import type { Trip, TripInput } from './types'

export const tripKeys = {
  all: ['trips'] as const,
  detail: (id: string | number) => ['trips', String(id)] as const,
}

export function useTrip(id: string | undefined) {
  return useQuery({
    queryKey: tripKeys.detail(id ?? ''),
    queryFn: () => api.getTrip(id!),
    enabled: Boolean(id),
  })
}

export function useTripHistory() {
  return useQuery({ queryKey: tripKeys.all, queryFn: api.listTrips })
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
