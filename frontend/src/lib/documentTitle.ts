import { useEffect } from 'react'

export const APP_NAME = 'RouteLog'
export const APP_TAGLINE = 'Trip planner & daily logs'

const DEFAULT_TITLE = `${APP_NAME} — ${APP_TAGLINE}`

/**
 * Names the browser tab after the page: "Trip history · RouteLog". With several
 * trips open at once, the tab strip is the only place they can be told apart.
 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : DEFAULT_TITLE
    return () => {
      document.title = DEFAULT_TITLE
    }
  }, [title])
}
