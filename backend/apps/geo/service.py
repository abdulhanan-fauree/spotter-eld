"""Cached facade over `clients`. This is what the rest of the project imports.

Every function here mirrors one in `providers` but reads and writes
`CachedResponse` first. Nothing else in the codebase should call `providers`
directly, so the rate-limit and free-tier protections cannot be bypassed by
accident.
"""

from __future__ import annotations

import logging
from dataclasses import asdict

from django.conf import settings
from django.db import DatabaseError

from . import geometry, providers
from .providers import GeoError, Place, Route, Step
from .models import CachedResponse, cache_key

log = logging.getLogger(__name__)

__all__ = [
    "GeoError",
    "Place",
    "Route",
    "Step",
    "geocode",
    "suggest",
    "reverse",
    "route",
    "annotate_stops",
    "locate_stops",
]


def _get(kind: str, key: str):
    """Read through the cache. A cache failure must never fail the lookup."""
    try:
        row = CachedResponse.objects.filter(kind=kind, key=key).first()
        if row is None or not row.is_fresh(settings.GEO_CACHE_DAYS):
            return None
        CachedResponse.objects.filter(pk=row.pk).update(hits=row.hits + 1)
        return row.payload
    except DatabaseError as exc:
        log.warning("geo cache read failed (%s:%s): %s", kind, key[:12], exc)
        return None


def _put(kind: str, key: str, query: str, payload) -> None:
    """Write through the cache, swallowing storage errors.

    The cache exists to respect Nominatim's one-request-per-second policy, not to
    hold the only copy of anything. If the write loses a race — three location
    fields autocomplete concurrently — the caller already has its answer, so
    raising here would turn a successful lookup into a 500.
    """
    try:
        CachedResponse.objects.update_or_create(
            kind=kind, key=key, defaults={"query": query, "payload": payload}
        )
    except DatabaseError as exc:
        log.warning("geo cache write failed (%s:%s): %s", kind, query[:40], exc)


# --------------------------------------------------------------------------- #
# Geocoding
# --------------------------------------------------------------------------- #


def geocode(query: str) -> Place:
    normalised = " ".join(query.strip().lower().split())
    key = cache_key("geocode", normalised)

    cached = _get(CachedResponse.KIND_GEOCODE, key)
    if cached:
        return Place(**cached)

    place = providers.geocode(query)
    _put(CachedResponse.KIND_GEOCODE, key, query, asdict(place))
    return place


def suggest(query: str, limit: int = 6) -> list[Place]:
    normalised = " ".join(query.strip().lower().split())
    key = cache_key("suggest", normalised, limit)

    cached = _get(CachedResponse.KIND_SUGGEST, key)
    if cached is not None:
        return [Place(**p) for p in cached]

    places = providers.suggest(query, limit)
    if places:  # never cache an empty result — the service may just have blipped
        _put(CachedResponse.KIND_SUGGEST, key, query, [asdict(p) for p in places])
    return places


def reverse(lat: float, lng: float) -> str:
    # Round to ~100 m before keying: consecutive shape points on the same stretch
    # of interstate should share one cache entry and one Nominatim call.
    key = cache_key("reverse", round(lat, 3), round(lng, 3))

    cached = _get(CachedResponse.KIND_REVERSE, key)
    if cached is not None:
        return cached.get("city_state", "")

    city_state = providers.reverse(lat, lng)
    if city_state:
        _put(CachedResponse.KIND_REVERSE, key, f"{lat},{lng}", {"city_state": city_state})
    return city_state


# --------------------------------------------------------------------------- #
# Routing
# --------------------------------------------------------------------------- #


def route(points: list[geometry.LatLng], *, mile_offset: float = 0.0) -> Route:
    rounded = [(round(lat, 5), round(lng, 5)) for lat, lng in points]
    key = cache_key("route", rounded, bool(settings.ORS_API_KEY))

    cached = _get(CachedResponse.KIND_ROUTE, key)
    if cached:
        # Mile markers are offset-dependent, so rebase them rather than storing
        # a separate cache entry per offset.
        base = cached.get("mile_offset", 0.0)
        shift = mile_offset - base
        return Route(
            distance_mi=cached["distance_mi"],
            duration_hr=cached["duration_hr"],
            geometry=[tuple(p) for p in cached["geometry"]],
            steps=[
                Step(
                    instruction=s["instruction"],
                    distance_mi=s["distance_mi"],
                    duration_hr=s["duration_hr"],
                    mile_marker=round(s["mile_marker"] + shift, 3),
                )
                for s in cached["steps"]
            ],
            provider=cached.get("provider", ""),
        )

    result = providers.route(points, mile_offset=mile_offset)
    _put(
        CachedResponse.KIND_ROUTE,
        key,
        " -> ".join(f"{lat:.4f},{lng:.4f}" for lat, lng in points),
        {
            "distance_mi": result.distance_mi,
            "duration_hr": result.duration_hr,
            "geometry": [list(p) for p in result.geometry],
            "steps": [asdict(s) for s in result.steps],
            "provider": result.provider,
            "mile_offset": mile_offset,
        },
    )
    return result


# --------------------------------------------------------------------------- #
# Placing the planner's stops on the map
# --------------------------------------------------------------------------- #


def annotate_stops(events, legs_geometry: list[geometry.LatLng], total_miles: float):
    """Return `events` with coordinates and a city/state filled in on every stop.

    Each event carries a `mile_marker` from the planner; `point_at_mile` turns it
    back into a coordinate, and one cached reverse-geocode per stop turns that
    into the Remarks entry the regulation requires:

        "Each time you change your duty status, you must write down the name of
         the city, town, or village, and State abbreviation"   -- guide p.17

    `Event` is frozen, so this rebuilds the tuple rather than mutating. Skipping
    that step is how the Remarks column silently comes out empty: the planner
    only knows the names of the pickup and dropoff, so every fuel stop, break and
    rest has a blank location until this runs.
    """
    from dataclasses import replace

    if not legs_geometry:
        return tuple(events)

    cumulative = geometry.rescale(legs_geometry, total_miles)
    out = []
    for event in events:
        if not event.is_stop or event.mile_marker is None:
            out.append(event)
            continue
        lat, lng = geometry.point_at_mile(legs_geometry, event.mile_marker, cumulative)
        # Named waypoints already know where they are; only synthesised stops
        # (fuel, rests, breaks) need looking up.
        out.append(
            replace(event, lat=lat, lng=lng, location=event.location or reverse(lat, lng))
        )
    return tuple(out)


def locate_stops(events, legs_geometry: list[geometry.LatLng], total_miles: float):
    """`annotate_stops`, yielding only the stops as (event, lat, lng, city_state)."""
    for event in annotate_stops(events, legs_geometry, total_miles):
        if event.is_stop and event.lat is not None:
            yield event, event.lat, event.lng, event.location
