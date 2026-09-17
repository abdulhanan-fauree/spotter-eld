import { describe, expect, it } from 'vitest'

import {
  bearingDeg,
  cumulativeMiles,
  directionArrows,
  distanceForMile,
  haversineMi,
  mileTicks,
  pointAtDistance,
  tickInterval,
  type LatLng,
} from './routeMath'

const DALLAS: LatLng = [32.7767, -96.797]
const OKC: LatLng = [35.4676, -97.5164]
const KC: LatLng = [39.0997, -94.5786]

describe('haversineMi', () => {
  it('matches the great-circle distance to within a mile', () => {
    // Dallas to Oklahoma City city centres, about 190 miles as the crow flies.
    expect(haversineMi(DALLAS, OKC)).toBeGreaterThan(189.5)
    expect(haversineMi(DALLAS, OKC)).toBeLessThan(191.5)
  })
})

describe('cumulativeMiles', () => {
  it('runs from zero and adds each leg', () => {
    const cum = cumulativeMiles([DALLAS, OKC, KC])
    expect(cum[0]).toBe(0)
    expect(cum[1]).toBeCloseTo(haversineMi(DALLAS, OKC), 6)
    expect(cum[2]).toBeCloseTo(cum[1] + haversineMi(OKC, KC), 6)
  })

  it('is empty for no points', () => {
    expect(cumulativeMiles([])).toEqual([])
  })
})

describe('bearingDeg', () => {
  it('points roughly north-north-west from Dallas to Oklahoma City', () => {
    const b = bearingDeg(DALLAS, OKC)
    expect(b).toBeGreaterThan(340)
    expect(b).toBeLessThan(360)
  })
})

describe('pointAtDistance', () => {
  const points: LatLng[] = [
    [0, 0],
    [0, 1],
    [1, 1],
  ]
  const cum = cumulativeMiles(points)

  it('interpolates inside a segment', () => {
    const { point } = pointAtDistance(points, cum, cum[1] / 2)
    expect(point[0]).toBeCloseTo(0, 6)
    expect(point[1]).toBeCloseTo(0.5, 6)
  })

  it('clamps to the ends', () => {
    expect(pointAtDistance(points, cum, -5).point).toEqual([0, 0])
    expect(pointAtDistance(points, cum, 1e9).point).toEqual([1, 1])
  })

  it('reports the heading of the segment it lands on', () => {
    expect(pointAtDistance(points, cum, cum[1] / 2).bearing).toBeCloseTo(90, 0)
    expect(pointAtDistance(points, cum, cum[1] + (cum[2] - cum[1]) / 2).bearing).toBeCloseTo(0, 0)
  })
})

describe('distanceForMile', () => {
  it('maps route miles onto the polyline proportionally', () => {
    const cum = [0, 50, 100]
    expect(distanceForMile(500, 1000, cum)).toBe(50)
    expect(distanceForMile(0, 0, cum)).toBe(0)
  })
})

describe('tickInterval and mileTicks', () => {
  it('picks a spacing that gives at most ten ticks', () => {
    expect(tickInterval(121)).toBe(25)
    expect(tickInterval(557)).toBe(100)
    expect(tickInterval(2127)).toBe(250)
    expect(tickInterval(7769)).toBe(1000)
  })

  it('places a tick at every interval short of the end', () => {
    const points: LatLng[] = [DALLAS, OKC, KC]
    const ticks = mileTicks(points, cumulativeMiles(points), 557)
    expect(ticks.map((t) => t.mile)).toEqual([100, 200, 300, 400, 500])
  })

  it('yields nothing for a degenerate route', () => {
    expect(mileTicks([DALLAS], [0], 100)).toEqual([])
  })
})

describe('directionArrows', () => {
  it('spreads the requested count along the line', () => {
    const points: LatLng[] = [DALLAS, OKC, KC]
    expect(directionArrows(points, cumulativeMiles(points), 4)).toHaveLength(4)
    expect(directionArrows([DALLAS], [0])).toEqual([])
  })
})
