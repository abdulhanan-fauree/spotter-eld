/**
 * The route, its stops, and its rests — the brief's first named output.
 *
 * Leaflet over Esri's Gray Canvas basemaps: free, no API key, and the light and
 * dark canvases are a matched pair, so theme support is one ternary. CARTO's
 * Positron / Dark Matter, used before, now watermark every tile with "API KEY
 * REQUIRED". The canvas is deliberately quiet so the route and the duty colours
 * carry the picture.
 *
 * What is drawn, bottom to top: the route in two legs (dashed while running
 * empty to the pickup, solid once loaded) with direction arrows and mile-marker
 * pills along it; every stop, numbered to match the itinerary; and, during
 * playback, the truck. Hovering the line reads out the mile under the cursor.
 */

import {
  divIcon,
  type DivIcon,
  type FitBoundsOptions,
  type LeafletMouseEvent,
  type Map as LeafletMap,
  type PathOptions,
} from 'leaflet'
import { Expand, Locate, Shrink } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  Marker,
  Polyline,
  ScaleControl,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'

import type { Stop } from '@/api/types'
import { DUTY_COLOR, DUTY_LABEL, ROUTE_INK, type DutyStatus } from '@/domain/duty'
import { formatClock, formatDuration, formatMiles } from '@/domain/format'
import { STOP_TITLE, type StopKind } from '@/domain/stops'
import { cumulativeMiles, directionArrows, mileAtIndex, mileTicks, type LatLng } from './routeMath'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas'
const TILES = {
  light: {
    base: `${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
  },
  dark: {
    base: `${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
  },
} as const
const TILE_ATTR =
  '&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
/** The Gray Canvas services stop at zoom 16. */
const MAX_ZOOM = 16

/**
 * A cross-country route is wide and short; fitting it in a squarish panel
 * leaves a band of empty map above and below. Asymmetric padding pulls the
 * route toward the middle without cropping either end.
 */
const FIT: FitBoundsOptions = {
  paddingTopLeft: [28, 56],
  paddingBottomRight: [28, 56],
  maxZoom: 9,
}

/** Stops that anchor the trip get a diamond; rests, breaks and fuel get a dot. */
const KEY_STOPS: ReadonlySet<StopKind> = new Set<StopKind>(['pre_trip', 'pickup', 'dropoff'])

// --------------------------------------------------------------------------- //
// Map-side helpers
// --------------------------------------------------------------------------- //

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length >= 2) map.fitBounds(points, FIT)
  }, [map, points])
  return null
}

/** Recentre when the reader picks a stop from the itinerary. */
function FocusStop({ stop }: { stop: Stop | null }) {
  const map = useMap()
  useEffect(() => {
    if (stop?.lat == null || stop?.lng == null) return
    map.flyTo([stop.lat, stop.lng], Math.max(map.getZoom(), 7), { duration: 0.6 })
  }, [map, stop])
  return null
}

/** Frame a set of points — a log day's stops, when its tab is picked. */
function FocusBounds({ points }: { points: LatLng[] | null }) {
  const map = useMap()
  useEffect(() => {
    if (!points || points.length === 0) return
    if (points.length === 1) map.flyTo(points[0], Math.max(map.getZoom(), 8), { duration: 0.6 })
    else map.flyToBounds(points, { padding: [48, 48], maxZoom: 10, duration: 0.6 })
  }, [map, points])
  return null
}

/** Index of the geometry vertex nearest a point. */
function nearestIndex(points: LatLng[], lat: number, lng: number): number {
  let best = 0
  let bestDistance = Infinity
  points.forEach(([pLat, pLng], i) => {
    const d = (pLat - lat) ** 2 + (pLng - lng) ** 2
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  })
  return best
}

// --------------------------------------------------------------------------- //
// Icons. Styled in `index.css`; Leaflet needs literal HTML here.
// --------------------------------------------------------------------------- //

function stopIcon(number: number, stop: Stop, active: boolean): DivIcon {
  const key = KEY_STOPS.has(stop.kind)
  const size = key ? 26 : 20
  const classes = ['stop-pin', key && 'stop-pin--key', active && 'stop-pin--active']
    .filter(Boolean)
    .join(' ')
  return divIcon({
    className: 'stop-marker',
    html: `<div class="${classes}" style="background:${DUTY_COLOR[stop.status]}"><span>${number}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, -size / 2],
  })
}

function truckIcon(status: DutyStatus, bearing: number): DivIcon {
  return divIcon({
    className: 'stop-marker',
    html: `<div class="truck-pin" style="color:${DUTY_COLOR[status]};transform:rotate(${bearing}deg)"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2.5 19.5 21 12 16.8 4.5 21z" fill="currentColor" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    tooltipAnchor: [14, 0],
  })
}

function tickIcon(mile: number): DivIcon {
  return divIcon({
    className: 'stop-marker',
    html: `<div class="mile-tick">${mile.toLocaleString()} mi</div>`,
    iconSize: [48, 16],
    iconAnchor: [24, 8],
  })
}

function arrowIcon(bearing: number): DivIcon {
  return divIcon({
    className: 'stop-marker',
    html: `<div class="route-arrow" style="transform:rotate(${bearing}deg)"><svg viewBox="0 0 12 12" width="12" height="12"><path d="M3 8 6 4 9 8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })
}

/**
 * One icon object per distinct look. A fresh DivIcon every render would make
 * Leaflet rebuild every marker's DOM on each hover or playback frame, and the
 * element under the cursor would be swapped out mid-hover.
 */
function useIconCache() {
  const cache = useRef(new Map<string, DivIcon>())
  return (key: string, make: () => DivIcon): DivIcon => {
    let icon = cache.current.get(key)
    if (!icon) {
      icon = make()
      cache.current.set(key, icon)
    }
    return icon
  }
}

// --------------------------------------------------------------------------- //
// Chrome
// --------------------------------------------------------------------------- //

function MapButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center rounded-lg border border-stone-300 bg-white/95 text-stone-600 shadow-sm backdrop-blur transition hover:border-teal-500 hover:text-teal-600 dark:border-stone-700 dark:bg-stone-900/95 dark:text-stone-300 dark:hover:border-teal-400 dark:hover:text-teal-400"
    >
      {children}
    </button>
  )
}

const DUTY_LEGEND = [
  { label: 'Off duty', colour: DUTY_COLOR.OFF },
  { label: 'Sleeper berth', colour: DUTY_COLOR.SB },
  { label: 'On duty', colour: DUTY_COLOR.ON },
]

/** Hidden on phones, where it would sit on top of the attribution line. */
function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-6 left-3 z-[1000] hidden rounded-lg bg-white/90 px-2.5 py-2 text-[11px] leading-snug shadow-sm backdrop-blur sm:block dark:bg-stone-900/90">
      {DUTY_LEGEND.map((l) => (
        <div key={l.label} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: l.colour }} />
          {l.label}
        </div>
      ))}
      <div className="mt-1.5 flex items-center gap-1.5 border-t border-stone-200/70 pt-1.5 dark:border-stone-700/70">
        <span className="size-2 rotate-45 rounded-[2px] bg-stone-400" />
        Start, pickup, dropoff
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-4 border-t-2 border-dashed" style={{ borderColor: ROUTE_INK }} />
        Empty to pickup
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-4 border-t-2" style={{ borderColor: ROUTE_INK }} />
        Loaded
      </div>
      <div className="flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden>
          <path d="M12 2.5 19.5 21 12 16.8 4.5 21z" fill={DUTY_COLOR.D} />
        </svg>
        Truck during playback
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------- //
// The map
// --------------------------------------------------------------------------- //

export interface TruckMarker {
  point: LatLng
  bearing: number
  status: DutyStatus
  mile: number
}

export interface RouteMapProps {
  geometry: LatLng[]
  stops: Stop[]
  /** Routing mileage, so polyline positions can be read as route miles. */
  totalMiles?: number
  /** Home terminal zone, for the times in stop tooltips. */
  timeZone?: string
  dark?: boolean
  activeStop?: number | null
  /** Sequence of the stop to centre on. */
  focusStop?: number | null
  /** Points to frame, e.g. one log day's stops. */
  focusBounds?: LatLng[] | null
  /** The playback position, or null to hide the truck. */
  truck?: TruckMarker | null
  onHoverStop?: (sequence: number | null) => void
  /** Clicking a stop marker. */
  onSelectStop?: (sequence: number) => void
  /** When `onToggleExpand` is given, an expand / collapse button is shown. */
  expanded?: boolean
  onToggleExpand?: () => void
  className?: string
}

export function RouteMap({
  geometry,
  stops,
  totalMiles = 0,
  timeZone,
  dark = false,
  activeStop = null,
  focusStop = null,
  focusBounds = null,
  truck = null,
  onHoverStop,
  onSelectStop,
  expanded = false,
  onToggleExpand,
  className,
}: RouteMapProps) {
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [hoverMile, setHoverMile] = useState<number | null>(null)
  const iconFor = useIconCache()

  const cum = useMemo(() => cumulativeMiles(geometry), [geometry])

  // Numbered to match the itinerary, which orders stops by mile marker.
  const numbered = useMemo(() => {
    const order = [...stops].sort((a, b) => a.mile_marker - b.mile_marker)
    const numbers = new Map(order.map((s, i) => [s.sequence, i + 1]))
    return stops
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => ({ stop: s, number: numbers.get(s.sequence) ?? 0 }))
  }, [stops])

  // Empty to the pickup, loaded from there on. The seam is the route vertex
  // nearest the pickup, which is exact enough at any zoom the panel reaches.
  const legs = useMemo(() => {
    const pickup = stops.find((s) => s.kind === 'pickup' && s.lat != null && s.lng != null)
    if (!pickup || geometry.length < 2) return { empty: [] as LatLng[], loaded: geometry }
    const seam = nearestIndex(geometry, pickup.lat!, pickup.lng!)
    return { empty: geometry.slice(0, seam + 1), loaded: geometry.slice(seam) }
  }, [geometry, stops])

  const ticks = useMemo(() => mileTicks(geometry, cum, totalMiles), [geometry, cum, totalMiles])
  const arrows = useMemo(() => directionArrows(geometry, cum, 8), [geometry, cum])

  // The panel changes size when expanded; Leaflet has to be told, then re-fit.
  useEffect(() => {
    if (!map) return
    const t = setTimeout(() => {
      map.invalidateSize()
      if (geometry.length >= 2) map.fitBounds(geometry, FIT)
    }, 60)
    return () => clearTimeout(t)
  }, [map, expanded, geometry])

  const tiles = dark ? TILES.dark : TILES.light
  const casing = dark ? '#1c1917' : '#ffffff'
  const centre: LatLng = geometry[0] ?? [39.5, -98.35]

  const casingStyle = useMemo<PathOptions>(
    () => ({ color: casing, weight: 7, opacity: 0.9, interactive: false }),
    [casing],
  )
  const emptyStyle = useMemo<PathOptions>(
    () => ({ color: ROUTE_INK, weight: 3.5, dashArray: '2 9', lineCap: 'round' }),
    [],
  )
  const loadedStyle = useMemo<PathOptions>(() => ({ color: ROUTE_INK, weight: 3.5 }), [])

  const routeEvents = useMemo(
    () => ({
      mousemove: (e: LeafletMouseEvent) => {
        if (totalMiles <= 0) return
        const idx = nearestIndex(geometry, e.latlng.lat, e.latlng.lng)
        setHoverMile(mileAtIndex(idx, totalMiles, cum))
      },
      mouseout: () => setHoverMile(null),
    }),
    [geometry, cum, totalMiles],
  )

  const hoverLabel = hoverMile == null ? 'Route' : `Mile ${Math.round(hoverMile).toLocaleString()}`

  return (
    <div className="relative h-full w-full">
      <MapContainer
        ref={setMap}
        center={centre}
        zoom={4}
        maxZoom={MAX_ZOOM}
        scrollWheelZoom
        className={className}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer key={`base-${dark}`} url={tiles.base} attribution={TILE_ATTR} maxZoom={MAX_ZOOM} />
        <TileLayer key={`labels-${dark}`} url={tiles.labels} maxZoom={MAX_ZOOM} />
        <FitBounds points={geometry} />
        <FocusStop stop={numbered.find((n) => n.stop.sequence === focusStop)?.stop ?? null} />
        <FocusBounds points={focusBounds} />

        {/* Casing under each line keeps the route legible over the basemap. */}
        {legs.empty.length > 1 && (
          <>
            <Polyline positions={legs.empty} pathOptions={casingStyle} />
            <Polyline positions={legs.empty} pathOptions={emptyStyle} eventHandlers={routeEvents}>
              <Tooltip sticky direction="top" offset={[0, -10]}>
                {hoverLabel}
              </Tooltip>
            </Polyline>
          </>
        )}
        <Polyline positions={legs.loaded} pathOptions={casingStyle} />
        <Polyline positions={legs.loaded} pathOptions={loadedStyle} eventHandlers={routeEvents}>
          <Tooltip sticky direction="top" offset={[0, -10]}>
            {hoverLabel}
          </Tooltip>
        </Polyline>

        {arrows.map((a, i) => (
          <Marker
            key={`arrow-${i}`}
            position={a.point}
            interactive={false}
            icon={iconFor(`arrow:${Math.round(a.bearing / 5) * 5}`, () =>
              arrowIcon(Math.round(a.bearing / 5) * 5),
            )}
            zIndexOffset={-200}
          />
        ))}

        {ticks.map((t) => (
          <Marker
            key={`tick-${t.mile}`}
            position={t.point}
            interactive={false}
            icon={iconFor(`tick:${t.mile}`, () => tickIcon(t.mile))}
            zIndexOffset={-100}
          />
        ))}

        {numbered.map(({ stop, number }) => {
          const active = activeStop === stop.sequence
          return (
            <Marker
              key={stop.sequence}
              position={[stop.lat!, stop.lng!]}
              icon={iconFor(`stop:${number}:${stop.kind}:${stop.status}:${active ? 1 : 0}`, () =>
                stopIcon(number, stop, active),
              )}
              zIndexOffset={active ? 1000 : KEY_STOPS.has(stop.kind) ? 500 : 0}
              eventHandlers={{
                mouseover: () => onHoverStop?.(stop.sequence),
                mouseout: () => onHoverStop?.(null),
                click: () => onSelectStop?.(stop.sequence),
              }}
            >
              <Tooltip direction="top">
                <div className="text-xs leading-snug">
                  <div className="font-semibold">
                    {number}. {STOP_TITLE[stop.kind]}
                  </div>
                  {stop.location && <div>{stop.location}</div>}
                  <div className="opacity-70">
                    {formatClock(stop.arrive_at, timeZone)} → {formatClock(stop.depart_at, timeZone)}{' '}
                    · {formatDuration(stop.duration_hr)}
                  </div>
                  <div className="opacity-70">{formatMiles(stop.mile_marker)} into the trip</div>
                </div>
              </Tooltip>
            </Marker>
          )
        })}

        {truck && (
          <Marker
            position={truck.point}
            interactive={false}
            icon={iconFor(`truck:${truck.status}:${Math.round(truck.bearing / 5) * 5}`, () =>
              truckIcon(truck.status, Math.round(truck.bearing / 5) * 5),
            )}
            zIndexOffset={2000}
          >
            <Tooltip permanent direction="right" className="truck-label">
              {DUTY_LABEL[truck.status]} · {formatMiles(truck.mile)}
            </Tooltip>
          </Marker>
        )}

        <ScaleControl position="bottomright" imperial metric={false} />
      </MapContainer>

      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-1.5">
        <MapButton
          label="Fit the whole route"
          onClick={() => {
            if (map && geometry.length >= 2) map.fitBounds(geometry, FIT)
          }}
        >
          <Locate size={15} />
        </MapButton>
        {onToggleExpand && (
          <MapButton label={expanded ? 'Collapse map' : 'Expand map'} onClick={onToggleExpand}>
            {expanded ? <Shrink size={15} /> : <Expand size={15} />}
          </MapButton>
        )}
      </div>

      <Legend />
    </div>
  )
}

export default RouteMap
