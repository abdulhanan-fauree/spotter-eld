import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from './client'

const INPUT = {
  current_location: 'Dallas, TX',
  pickup_location: 'Oklahoma City, OK',
  dropoff_location: 'Newark, NJ',
  current_cycle_used: 0,
}

function respond(status: number, body: string | null, contentType = 'application/json') {
  return new Response(body, {
    status,
    headers: body == null ? {} : { 'Content-Type': contentType },
  })
}

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)

afterEach(() => {
  fetchMock.mockReset()
  vi.useRealTimers()
})

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(ApiError)
  return err as ApiError
}

describe('api client', () => {
  it('treats 204 as success with no body', async () => {
    fetchMock.mockResolvedValue(respond(204, null))
    await expect(api.deleteTrip(1)).resolves.toBeUndefined()
  })

  it('surfaces per-field errors from a 400 and does not retry them', async () => {
    fetchMock.mockResolvedValue(
      respond(400, JSON.stringify({ dropoff_location: ['Pickup and dropoff must differ.'] })),
    )
    const err = await failure(api.planTrip(INPUT))
    expect(err.status).toBe(400)
    expect(err.fields?.dropoff_location[0]).toBe('Pickup and dropoff must differ.')
    expect(err.message).toBe('Pickup and dropoff must differ.')
    expect(err.transient).toBe(false)
  })

  it("uses the server's detail on a 404", async () => {
    fetchMock.mockResolvedValue(respond(404, JSON.stringify({ detail: 'No Trip matches.' })))
    const err = await failure(api.getTrip(99))
    expect(err.status).toBe(404)
    expect(err.message).toBe('No Trip matches.')
    expect(err.transient).toBe(false)
  })

  it('does not choke on an HTML 502 from a proxy', async () => {
    fetchMock.mockResolvedValue(respond(502, '<html>Bad gateway</html>', 'text/html'))
    const err = await failure(api.listTrips())
    expect(err.status).toBe(502)
    expect(err.message).toMatch(/502/)
    expect(err.transient).toBe(true)
  })

  it('explains a rate limit', async () => {
    fetchMock.mockResolvedValue(respond(429, null))
    const err = await failure(api.suggest('Dallas'))
    expect(err.status).toBe(429)
    expect(err.message).toMatch(/Too many requests/)
    expect(err.transient).toBe(true)
  })

  it('maps a network failure to status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await failure(api.listTrips())
    expect(err.status).toBe(0)
    expect(err.message).toMatch(/Could not reach the server/)
    expect(err.transient).toBe(true)
  })

  it('gives up on a request that hangs, as a 408', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          )
        }),
    )
    // Attach the handler before the clock moves, or the rejection is briefly
    // unowned and Node reports it as unhandled.
    const pending = failure(api.listTrips())
    await vi.advanceTimersByTimeAsync(20_001)
    const err = await pending
    expect(err.status).toBe(408)
    expect(err.message).toMatch(/took too long/)
    expect(err.transient).toBe(true)
  })

  it('rejects a 200 whose body is not JSON instead of returning null', async () => {
    fetchMock.mockResolvedValue(respond(200, 'not json', 'text/plain'))
    const err = await failure(api.listTrips())
    expect(err.status).toBe(200)
    expect(err.message).toMatch(/could not be read/)
  })
})
