/**
 * Last line of defence for a render error.
 *
 * Without this a thrown error anywhere below unmounts the whole tree and the
 * reader sees a blank page with no way back. With it the header and nav stay,
 * and the failure is contained to the page that caused it.
 */

import { TriangleAlert } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

import EmptyState from './EmptyState'

interface Props {
  /** Mount with `key={pathname}` so navigating away clears a caught error. */
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page failed to render', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="mx-auto max-w-app px-6 py-16">
        <EmptyState
          icon={TriangleAlert}
          title="Something went wrong"
          body={this.state.error.message || 'This page failed to render.'}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Try again
              </button>
              <a
                href="/"
                className="rounded-lg border border-stone-300 px-3.5 py-2 text-sm font-semibold hover:border-stone-400 dark:border-stone-700 dark:hover:border-stone-600"
              >
                Reload the app
              </a>
            </div>
          }
        />
      </div>
    )
  }
}

export default ErrorBoundary
