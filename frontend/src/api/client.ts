import type { Place, Trip, TripInput, TripListRow } from './types'

const BASE = import.meta.env.VITE_API_BASE ?? '/api'

/** Planning calls two external services, and may land on a cold function first. */
const PLAN_TIMEOUT_MS = 90_000
const DEFAULT_TIMEOUT_MS = 20_000

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

  /** Worth an automatic retry: the network, a timeout, a 5xx, or a rate limit. */
  get transient(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500
  }
}

/** The server's `detail` where it gives one; otherwise something a person can act on. */
function describe(status: number, detail: unknown): string {
  if (typeof detail === 'string' && detail.trim()) return detail
  if (status === 404) return 'Not found.'
  if (status === 429) return 'Too many requests. Wait a minute and try again.'
  if (status >= 500) return `The server had a problem (${status}). Please try again.`
  return `Request failed (${status}).`
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: controller.signal,
      ...init,
    })
  } catch (err) {
    if ((err as Error | null)?.name === 'AbortError') {
      throw new ApiError(
        `The server took too long to respond (over ${Math.round(timeoutMs / 1000)} s). Please try again.`,
        408,
      )
    }
    throw new ApiError(
      'Could not reach the server. Check your connection, or that the backend is running.',
      0,
    )
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 204) return undefined as T

  // A proxy in front of the API answers 502/504 with HTML. Never let the parse
  // failure mask the status that explains it.
  const body: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    // 400 carries per-field validation errors; 422 a single planning failure.
    if (res.status === 400 && body && typeof body === 'object' && !('detail' in body)) {
      const fields = body as Record<string, string[]>
      const first = Object.values(fields).flat()[0]
      throw new ApiError(first ? String(first) : 'Please check the form.', 400, fields)
    }
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? (body as { detail: unknown }).detail
        : undefined
    throw new ApiError(describe(res.status, detail), res.status)
  }

  if (body === null) {
    throw new ApiError('The server returned a response that could not be read.', res.status)
  }
  return body as T
}

export const api = {
  planTrip: (input: TripInput) =>
    request<Trip>('/trips/', { method: 'POST', body: JSON.stringify(input) }, PLAN_TIMEOUT_MS),

  getTrip: (id: number | string) => request<Trip>(`/trips/${id}/`),

  listTrips: () => request<TripListRow[]>('/trips/'),

  /** 204 on success; the server cascades through stops, steps and log sheets. */
  deleteTrip: (id: number | string) => request<void>(`/trips/${id}/`, { method: 'DELETE' }),

  suggest: (q: string) => request<Place[]>(`/geocode/?q=${encodeURIComponent(q)}`),
}
