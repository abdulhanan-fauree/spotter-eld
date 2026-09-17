import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'spotter-theme'

function currentTheme(): Theme {
  const stamped = document.documentElement.getAttribute('data-theme')
  return stamped === 'light' || stamped === 'dark' ? stamped : resolveTheme()
}

/**
 * The live theme. Follows the root attribute, so a component that renders
 * colour in JS (the map) flips with the header toggle instead of waiting for
 * its next unrelated re-render.
 */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setTheme(currentTheme()))
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}

export function resolveTheme(): Theme {
  const saved = localStorage.getItem(KEY) as Theme | null
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme
  localStorage.setItem(KEY, theme)
}
