import type { Place, Trip, TripInput, TripListRow } from './types'

const BASE = import.meta.env.VITE_API_BASE ?? '/api'

/**
 * A failed request that still carries the server's field errors.
 *
 * Fields are declared explicitly rather than as constructor parameter
 * properties: the project builds with `erasableSyntaxOnly`, which forbids any
 * TypeScript syntax that emits runtime code.
 */
export class ApiError extends Error {
  readonly status: number
  readonly fields?: Record<string, string[]>

  constructor(message: string, status: number, fields?: Record<string, string[]>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    throw new ApiError('Could not reach the server. Is the backend running?', 0)
  }

  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => null)

  if (!res.ok) {
    // 400 carries per-field validation errors; 422 a single planning failure.
    if (res.status === 400 && body && typeof body === 'object' && !('detail' in body)) {
      const fields = body as Record<string, string[]>
      const first = Object.values(fields)[0]?.[0] ?? 'Please check the form.'
      throw new ApiError(first, 400, fields)
    }
    throw new ApiError(body?.detail ?? `Request failed (${res.status})`, res.status)
  }

  return body as T
}

export const api = {
  planTrip: (input: TripInput) =>
    request<Trip>('/trips/', { method: 'POST', body: JSON.stringify(input) }),

  getTrip: (id: number | string) => request<Trip>(`/trips/${id}/`),

  listTrips: () => request<TripListRow[]>('/trips/'),

  suggest: (q: string) => request<Place[]>(`/geocode/?q=${encodeURIComponent(q)}`),
}
