"""Photon — autocomplete, and nearest-settlement reverse lookup. Free, no key."""

from __future__ import annotations

import logging

import httpx

from ..us_states import abbreviate
from .base import Place, http_client

log = logging.getLogger(__name__)

SEARCH = "https://photon.komoot.io/api"
REVERSE = "https://photon.komoot.io/reverse"  # NB: not under /api

# The regulation names three settlement types; anything else is a fallback.
# Guide p.17: "the name of the city, town, or village, and State abbreviation".
PREFERRED_PLACES = ("city", "town", "village")
FALLBACK_PLACES = ("municipality", "suburb", "hamlet", "locality", "borough")


def suggest(query: str, limit: int = 6) -> list[Place]:
    """Typeahead suggestions. Photon copes with partial words; Nominatim does not."""
    if not query or len(query.strip()) < 2:
        return []

    try:
        with http_client() as c:
            r = c.get(SEARCH, params={"q": query.strip(), "limit": limit})
            r.raise_for_status()
            payload = r.json()
    except httpx.HTTPError as exc:
        log.warning("photon unavailable: %s", exc)
        return []

    places: list[Place] = []
    for feat in payload.get("features", []):
        props = feat.get("properties", {})
        coords = feat.get("geometry", {}).get("coordinates")
        if not coords:
            continue
        city = props.get("city") or props.get("name") or props.get("county") or ""
        state = abbreviate(props.get("state"))
        parts = [p for p in (props.get("name"), props.get("city"), state, props.get("country")) if p]
        places.append(
            Place(
                name=", ".join(dict.fromkeys(parts)),
                lat=float(coords[1]),
                lng=float(coords[0]),
                city_state=f"{city}, {state}" if city and state else city or "",
            )
        )
    return places


def nearest_settlement(lat: float, lng: float) -> str:
    """Nearest named settlement to a coordinate.

    Nominatim answers "what is *at* this point", which for a rest area on I-70 is
    a county. Photon with a search radius answers "what is *near* this point",
    which is the town — and the town is what a driver actually writes down.

    Two passes, mirroring the regulation's own wording: take the nearest
    city/town/village if there is one, otherwise the nearest smaller settlement.
    Photon returns features in distance order, so "first match" is "nearest".
    `radius` is essential — without it the query finds nothing rural.
    """
    try:
        with http_client() as c:
            r = c.get(
                REVERSE,
                params={"lat": lat, "lon": lng, "limit": 8, "osm_tag": "place", "radius": 30},
            )
            r.raise_for_status()
            features = r.json().get("features", [])
    except httpx.HTTPError as exc:
        log.warning("photon reverse failed at %s,%s: %s", lat, lng, exc)
        return ""

    candidates = []
    for feat in features:
        props = feat.get("properties", {})
        name = (props.get("name") or "").strip()
        kind = (props.get("osm_value") or "").strip().lower()
        # Photon happily returns postcodes and street segments under place tags.
        if not name or name.isdigit() or kind not in PREFERRED_PLACES + FALLBACK_PLACES:
            continue
        candidates.append((name, abbreviate(props.get("state")), kind))

    for tiers in (PREFERRED_PLACES, FALLBACK_PLACES):
        for name, state, kind in candidates:
            if kind in tiers:
                return f"{name}, {state}" if state else name
    return ""
