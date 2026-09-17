import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'

import { ApiError } from '@/api/client'
import { Shell } from '@/components/ui'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import History from '@/pages/History'
import NotFound from '@/pages/NotFound'
import Planner from '@/pages/Planner'
import Results from '@/pages/Results'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Retry only what might succeed a second time. A 404 or a validation
      // error will not, and retrying it just delays the message.
      retry: (failureCount, error) =>
        failureCount < 2 && error instanceof ApiError && error.transient,
    },
  },
})

/**
 * A render error on one page must not take the header and nav down with it.
 * Keyed by path so that navigating away remounts the boundary and clears it.
 */
function Pages() {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary key={pathname}>
      <Routes>
        <Route path="/" element={<Planner />} />
        <Route path="/trips" element={<History />} />
        <Route path="/trips/:id" element={<Results />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Shell>
          <Pages />
        </Shell>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
