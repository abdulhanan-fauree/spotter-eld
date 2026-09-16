import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from '@/App'
import './index.css'
import { applyTheme, resolveTheme } from '@/lib/theme'

// Stamp the theme before first paint so the page never flashes the wrong one.
applyTheme(resolveTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
