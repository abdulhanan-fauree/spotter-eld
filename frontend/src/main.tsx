import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from '@/App'
import './index.css'
import { applyTheme, resolveTheme } from '@/lib/theme'

// Stamp the theme before first paint so the page never flashes the wrong one.
applyTheme(resolveTheme())

// Printing while the dark theme is active puts light ink on white paper.
// The print stylesheet handles this on its own; swapping the attribute for the
// duration of the job is the belt-and-braces version, and it also covers
// components that read the theme in JS rather than through CSS. Deliberately
// does not touch localStorage, so the stored preference survives untouched and
// `resolveTheme()` restores it afterwards.
window.addEventListener('beforeprint', () => {
  document.documentElement.setAttribute('data-theme', 'light')
})
window.addEventListener('afterprint', () => {
  applyTheme(resolveTheme())
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
