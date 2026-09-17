/**
 * Geometry along the route polyline. Pure; no Leaflet, no React.
 *
 * The polyline is simplified, so its geometric length is not the routing
 * engine's mileage. Anything that places a route mile on the map therefore
 * works in fractions: mile / total miles of the polyline's own length.
 */

export type LatLng = [number, number]

const EARTH_RADIUS_MI = 3958.7613
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export function haversineMi([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(a))
}

/** Running distance at each vertex: `[0, d1, d1+d2, …]`. Empty for no points. */
export function cumulativeMiles(points: LatLng[]): number[] {
  const out: number[] = []
  let total = 0
  points.forEach((p, i) => {
    if (i > 0) total += haversineMi(points[i - 1], p)
    out.push(total)
  })
  return out
}

/** Initial bearing from `a` to `b`, in degrees clockwise from north. */
export function bearingDeg([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const p1 = rad(lat1)
  const p2 = rad(lat2)
  const dl = rad(lng2 - lng1)
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

export interface RoutePoint {
  point: LatLng
  bearing: number
}

/** The point `distance` along the polyline (clamped to its ends) and the heading there. */
export function pointAtDistance(points: LatLng[], cum: number[], distance: number): RoutePoint {
  if (points.length === 0) return { point: [0, 0], bearing: 0 }
  if (points.length === 1) return { point: points[0], bearing: 0 }

  const total = cum[cum.length - 1]
  const d = Math.min(Math.max(distance, 0), total)

  // Binary search for the segment that contains d.
  let lo = 0
  let hi = cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= d) lo = mid
    else hi = mid
  }

  const a = points[lo]
  const b = points[hi]
  const span = cum[hi] - cum[lo]
  const f = span > 0 ? (d - cum[lo]) / span : 0
  return {
    point: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f],
    bearing: bearingDeg(a, b),
  }
}

/** Route mile → polyline distance, by the fraction of the trip covered. */
export function distanceForMile(mile: number, totalMiles: number, cum: number[]): number {
  const length = cum[cum.length - 1] ?? 0
  return totalMiles > 0 ? (mile / totalMiles) * length : 0
}

/** Polyline vertex index → route mile, the inverse of `distanceForMile`. */
export function mileAtIndex(index: number, totalMiles: number, cum: number[]): number {
  const length = cum[cum.length - 1] ?? 0
  return length > 0 ? (cum[index] / length) * totalMiles : 0
}

/** A round spacing that yields at most ten labelled ticks over the trip. */
export function tickInterval(totalMiles: number): number {
  for (const step of [25, 50, 100, 250, 500, 1000]) if (totalMiles / step <= 10) return step
  return 2000
}

export interface MileTick extends RoutePoint {
  mile: number
}

export function mileTicks(points: LatLng[], cum: number[], totalMiles: number): MileTick[] {
  if (points.length < 2 || totalMiles <= 0) return []
  const step = tickInterval(totalMiles)
  const ticks: MileTick[] = []
  for (let mile = step; mile < totalMiles; mile += step) {
    ticks.push({ mile, ...pointAtDistance(points, cum, distanceForMile(mile, totalMiles, cum)) })
  }
  return ticks
}

/** Evenly spaced headings along the line, for direction arrows. */
export function directionArrows(points: LatLng[], cum: number[], count = 8): RoutePoint[] {
  if (points.length < 2) return []
  const length = cum[cum.length - 1]
  return Array.from({ length: count }, (_, i) =>
    pointAtDistance(points, cum, (length * (i + 0.5)) / count),
  )
}
