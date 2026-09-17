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
      className="rounded-lg p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100"
    >
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-lg px-3 py-1.5 text-sm font-medium transition',
    isActive
      ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
      : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800',
  ].join(' ')

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-stone-200 bg-white/80 backdrop-blur-md dark:border-stone-800 dark:bg-stone-950/80">
        <div className="mx-auto flex max-w-app items-center gap-4 px-6 py-3">
          <NavLink to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-teal-600 text-white">
              <Truck size={15} />
            </span>
            RouteLog
            <span className="hidden text-xs font-normal text-stone-400 md:inline">
              Trip planner &amp; daily logs
            </span>
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
            <span className="hidden text-xs text-stone-400 sm:inline">
              FMCSA 70 hr / 8 day
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="no-print border-t border-stone-200 px-6 py-5 text-center text-xs text-stone-400 dark:border-stone-800">
        Hours of service per 49 CFR § 395 · property-carrying, 70 hr / 8 day, no adverse
        driving conditions
      </footer>
    </div>
  )
}

export default Shell
