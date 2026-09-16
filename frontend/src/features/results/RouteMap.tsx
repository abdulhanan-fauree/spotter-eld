/**
 * The route, its stops, and its rests — the brief's first named output.
 *
 * Leaflet with CARTO basemaps: free, no API key, and Positron/Dark Matter are a
 * matched light/dark pair, so theme support costs one ternary rather than a
 * second map provider.
 */

import { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'

import type { Stop } from '@/api/types'
import { DUTY_COLOR, ROUTE_BLUE } from '@/domain/duty'
import { formatDuration, formatMiles } from '@/domain/format'
import { STOP_TITLE } from '@/domain/stops'

const CARTO_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length < 2) return
    // A cross-country route is wide and short; fitting it in a squarish panel
    // leaves a band of empty ocean above and below. Asymmetric padding pulls the
    // route toward the middle without cropping either end.
    map.fitBounds(points as [number, number][], {
      paddingTopLeft: [28, 56],
      paddingBottomRight: [28, 56],
      maxZoom: 9,
    })
  }, [map, points])
  return null
}

const LEGEND: { label: string; colour: string }[] = [
  { label: 'Off duty', colour: '#64748b' },
  { label: 'Sleeper berth', colour: '#6366f1' },
  { label: 'On duty', colour: '#f59e0b' },
]

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-lg bg-white/90 px-2.5 py-2 text-[11px] shadow-sm backdrop-blur dark:bg-slate-900/90">
      {LEGEND.map((l) => (
        <div key={l.label} className="flex items-center gap-1.5 leading-snug">
          <span className="size-2 rounded-full" style={{ backgroundColor: l.colour }} />
          {l.label}
        </div>
      ))}
    </div>
  )
}

/** Recentre when the reader picks a stop from the itinerary. */
function FocusStop({ stop }: { stop: Stop | null }) {
  const map = useMap()
  useEffect(() => {
    if (!stop?.lat || !stop?.lng) return
    map.flyTo([stop.lat, stop.lng], Math.max(map.getZoom(), 7), { duration: 0.6 })
  }, [map, stop])
  return null
}

export interface RouteMapProps {
  geometry: [number, number][]
  stops: Stop[]
  dark?: boolean
  activeStop?: number | null
  /** Sequence of the stop to centre on. */
  focusStop?: number | null
  onHoverStop?: (sequence: number | null) => void
  className?: string
}

export function RouteMap({
  geometry,
  stops,
  dark = false,
  activeStop = null,
  focusStop = null,
  onHoverStop,
  className,
}: RouteMapProps) {
  const pinned = useMemo(
    () => stops.filter((s) => s.lat != null && s.lng != null),
    [stops],
  )
  const centre = geometry[0] ?? [39.5, -98.35]

  return (
    <div className="relative h-full w-full">
    <MapContainer
      center={centre}
      zoom={4}
      scrollWheelZoom
      className={className}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer url={dark ? CARTO_DARK : CARTO_LIGHT} attribution={CARTO_ATTR} />
      <FitBounds points={geometry} />
      <FocusStop stop={pinned.find((s) => s.sequence === focusStop) ?? null} />

      {/* Casing under the route line keeps it legible over both basemaps. */}
      <Polyline positions={geometry} pathOptions={{ color: dark ? '#0f172a' : '#ffffff', weight: 7, opacity: 0.9 }} />
      <Polyline positions={geometry} pathOptions={{ color: ROUTE_BLUE, weight: 3.5, opacity: 1 }} />

      {pinned.map((stop, i) => {
        const active = activeStop === stop.sequence
        return (
          <CircleMarker
            key={stop.sequence}
            center={[stop.lat!, stop.lng!]}
            radius={active ? 11 : 7}
            pathOptions={{
              color: dark ? '#0f172a' : '#ffffff',
              weight: 2.5,
              fillColor: DUTY_COLOR[stop.status],
              fillOpacity: 1,
            }}
            eventHandlers={{
              mouseover: () => onHoverStop?.(stop.sequence),
              mouseout: () => onHoverStop?.(null),
            }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <div className="text-xs">
                <div className="font-semibold">
                  {i + 1}. {STOP_TITLE[stop.kind]}
                </div>
                <div>{stop.location}</div>
                <div className="opacity-70">
                  {formatMiles(stop.mile_marker)} · {formatDuration(stop.duration_hr)}
                </div>
              </div>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
      <Legend />
    </div>
  )
}

export default RouteMap
