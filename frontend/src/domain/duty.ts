/**
 * Duty-status vocabulary — the single source of truth for the four lines of the
 * § 395.8 graph grid.
 *
 * This module is the bottom of the dependency graph: it imports nothing, and the
 * API layer, the log renderer, the map and the itinerary all import *from* here.
 * Previously `DutyStatus` lived in `components/log/grid.ts`, which meant
 * `api/types.ts` depended on a component in order to describe a server payload —
 * backwards, and the kind of edge that makes a codebase hard to move around in.
 */

export type DutyStatus = 'OFF' | 'SB' | 'D' | 'ON'

/** Top-to-bottom order of the grid rows, as printed on the form. */
export const DUTY_ORDER: readonly DutyStatus[] = ['OFF', 'SB', 'D', 'ON'] as const

export const DUTY_LABEL: Record<DutyStatus, string> = {
  OFF: 'Off Duty',
  SB: 'Sleeper Berth',
  D: 'Driving',
  ON: 'On Duty (not driving)',
}

/** Row number as printed: "1. Off Duty" … "4. On Duty (not driving)". */
export const DUTY_ROW_NUMBER: Record<DutyStatus, number> = { OFF: 1, SB: 2, D: 3, ON: 4 }

/**
 * One colour per duty status, used identically on the map pins, the itinerary
 * chips, the gauges and the log grid.
 *
 * Kept in step with the `--color-duty-*` custom properties in `index.css`;
 * Leaflet and inline SVG need literal values, CSS needs the variables. Any change
 * has to happen in both, which is why they sit next to each other in the comment
 * rather than being scattered across four components as they were.
 */
export const DUTY_COLOR: Record<DutyStatus, string> = {
  OFF: '#78716c', // stone  — var(--color-duty-off)
  SB: '#8b5cf6', // violet — var(--color-duty-sb)
  D: '#0d9488', // teal   — var(--color-duty-d)
  ON: '#f59e0b', // amber  — var(--color-duty-on)
}

/** The drawn duty line and the route polyline: one ink for "where the truck went". */
export const ROUTE_INK = '#0f766e'

export const isOnDuty = (s: DutyStatus): boolean => s === 'D' || s === 'ON'
export const isRest = (s: DutyStatus): boolean => s === 'OFF' || s === 'SB'
