// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest'

vi.mock('@/api/client', () => ({
  api: { deleteTrip: vi.fn() },
}))

import { api } from '@/api/client'
import { tripKeys } from '@/api/hooks'

import { DeleteTripButton } from './DeleteTripButton'

function renderWith(client: QueryClient, ui: ReactElement) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

let deleteTrip: MockedFunction<typeof api.deleteTrip>

describe('DeleteTripButton', () => {
  // A fresh spy per test rather than `mockClear` / `mockReset`: under Vitest 4,
  // a spy whose state has been cleared lets the next rejected promise escape as
  // the test's own failure instead of flowing through React Query. Swapping the
  // function on the mocked module sidesteps that entirely.
  beforeEach(() => {
    deleteTrip = vi.fn<typeof api.deleteTrip>()
    api.deleteTrip = deleteTrip
  })
  afterEach(cleanup)

  it('asks before deleting, and cancel backs out without a request', () => {
    renderWith(new QueryClient(), <DeleteTripButton id={1} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete trip' }))
    expect(screen.getByText('Delete this trip?')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Delete this trip?')).toBeNull()
    expect(deleteTrip).not.toHaveBeenCalled()
  })

  it('confirming calls the API, drops the row from the history cache, and reports back', async () => {
    deleteTrip.mockResolvedValue(undefined)
    const client = new QueryClient()
    client.setQueryData(tripKeys.all, [{ id: 1 }, { id: 2 }])
    const onDeleted = vi.fn()

    renderWith(client, <DeleteTripButton id={1} onDeleted={onDeleted} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete trip' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(deleteTrip).toHaveBeenCalledWith(1)
    expect(client.getQueryData(tripKeys.all)).toEqual([{ id: 2 }])
  })

  it('shows the server message when deletion fails, and can be retried', async () => {
    deleteTrip.mockRejectedValue(new Error('Request failed (500)'))

    renderWith(new QueryClient(), <DeleteTripButton id={7} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete trip' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Request failed (500)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete trip' })).toBeTruthy()
  })
})
