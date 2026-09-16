/**
 * App chrome: one header, one nav, one theme toggle.
 *
 * Every page renders inside this so the product reads as a single application
 * rather than a set of routes that happen to share a stylesheet.
 */

import { Moon, Sun, Truck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'

import { applyTheme, resolveTheme, type Theme } from '@/lib/theme'

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => setTheme(resolveTheme()), [])

  const flip = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  return (
    <button
      onClick={flip}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-lg px-3 py-1.5 text-sm font-medium transition',
    isActive
      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
  ].join(' ')

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
          <NavLink to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Truck size={15} />
            </span>
            Spotter ELD
          </NavLink>

          <nav className="ml-4 flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              Plan
            </NavLink>
            <NavLink to="/trips" className={navClass}>
              History
            </NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <span className="hidden text-xs text-slate-400 sm:inline">
              FMCSA 70 hr / 8 day
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="no-print border-t border-slate-200 px-6 py-5 text-center text-xs text-slate-400 dark:border-slate-800">
        Hours of service per 49 CFR § 395 · property-carrying, 70 hr / 8 day, no adverse
        driving conditions
      </footer>
    </div>
  )
}

export default Shell
