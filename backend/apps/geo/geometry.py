"""Route geometry: pure functions over lists of (lat, lng) points.

No Django, no I/O. The one job that matters here is `point_at_mile`: every rest,
fuel stop and break the planner emits carries a `mile_marker`, and this is what
turns that number back into a place on the map and a city for the Remarks column.

A note on coordinate order, because it is the classic bug in this layer:
GeoJSON stores positions as [longitude, latitude]. Everything in this module uses
(lat, lng). `from_geojson` is the only place the swap happens.
"""

from __future__ import annotations

from math import asin, cos, radians, sin, sqrt

LatLng = tuple[float, float]

EARTH_RADIUS_MI = 3958.7613


def haversine_mi(a: LatLng, b: LatLng) -> float:
    """Great-circle distance in statute miles."""
    lat1, lng1 = radians(a[0]), radians(a[1])
    lat2, lng2 = radians(b[0]), radians(b[1])
    dlat, dlng = lat2 - lat1, lng2 - lng1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_MI * asin(min(1.0, sqrt(h)))


def from_geojson(coordinates: list[list[float]]) -> list[LatLng]:
    """[[lng, lat], ...] -> [(lat, lng), ...]."""
    return [(float(c[1]), float(c[0])) for c in coordinates]


def to_geojson(points: list[LatLng]) -> list[list[float]]:
    """[(lat, lng), ...] -> [[lng, lat], ...]."""
    return [[lng, lat] for lat, lng in points]


def cumulative_miles(points: list[LatLng]) -> list[float]:
    """Distance along the polyline at each vertex. Starts at 0, same length as `points`."""
    out = [0.0]
    for a, b in zip(points, points[1:]):
        out.append(out[-1] + haversine_mi(a, b))
    return out


def total_miles(points: list[LatLng]) -> float:
    return cumulative_miles(points)[-1] if len(points) > 1 else 0.0


def point_at_mile(
    points: list[LatLng],
    mile: float,
    cumulative: list[float] | None = None,
) -> LatLng:
    """The coordinate `mile` miles along the polyline, interpolated between vertices.

    Clamped at both ends, so a mile marker past the end of the route returns the
    destination rather than raising -- the planner's mileage and the geometry's
    own length differ slightly (the route API's distance is road distance; ours is
    the sum of great-circle hops between shape points), and a stop landing 0.3
    miles past the last vertex should still get a pin.
    """
    if not points:
        raise ValueError("empty geometry")
    if len(points) == 1:
        return points[0]

    cum = cumulative if cumulative is not None else cumulative_miles(points)
    if mile <= 0:
        return points[0]
    if mile >= cum[-1]:
        return points[-1]

    # binary search for the segment containing `mile`
    lo, hi = 0, len(cum) - 1
    while lo + 1 < hi:
        mid = (lo + hi) // 2
        if cum[mid] <= mile:
            lo = mid
        else:
            hi = mid

    span = cum[hi] - cum[lo]
    if span <= 0:
        return points[lo]
    t = (mile - cum[lo]) / span
    (lat1, lng1), (lat2, lng2) = points[lo], points[hi]
    return (lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t)


def rescale(points: list[LatLng], target_miles: float) -> list[float]:
    """Cumulative distances rescaled so the polyline's length equals `target_miles`.

    The routing API reports true road distance; summing great-circle hops between
    shape points under-measures it slightly. Rescaling keeps mile markers honest
    against the distance the planner actually simulated.
    """
    cum = cumulative_miles(points)
    if cum[-1] <= 0 or target_miles <= 0:
        return cum
    factor = target_miles / cum[-1]
    return [c * factor for c in cum]


def simplify(points: list[LatLng], tolerance_mi: float = 0.25) -> list[LatLng]:
    """Drop shape points closer together than `tolerance_mi`.

    A cross-country ORS response can carry tens of thousands of vertices; the map
    cannot show that detail and the JSON payload should not carry it. Endpoints
    are always preserved.
    """
    if len(points) <= 2:
        return list(points)
    kept = [points[0]]
    for p in points[1:-1]:
        if haversine_mi(kept[-1], p) >= tolerance_mi:
            kept.append(p)
    kept.append(points[-1])
    return kept


def bounding_box(points: list[LatLng]) -> tuple[float, float, float, float]:
    """(min_lat, min_lng, max_lat, max_lng) — for fitting the map to the route."""
    lats = [p[0] for p in points]
    lngs = [p[1] for p in points]
    return (min(lats), min(lngs), max(lats), max(lngs))
