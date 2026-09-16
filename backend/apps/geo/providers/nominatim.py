"""Nominatim — forward and reverse geocoding. Free, no key, 1 request/second."""

from __future__ import annotations

import logging

import httpx

from ..us_states import abbreviate, from_iso3166_2
from .base import GeoError, Place, http_client
from .photon import nearest_settlement

log = logging.getLogger(__name__)

BASE = "https://nominatim.openstreetmap.org"


def _state_of(address: dict) -> str:
    return from_iso3166_2(address.get("ISO3166-2-lvl4")) or abbreviate(address.get("state"))


def _settlement_of(address: dict) -> str:
    """A city, town or village — what the Remarks column is supposed to name.

    Deliberately excludes `county`: "Wayne County, IN" is not a town, and guide
    p.17 asks for "the name of the city, town, or village, and State abbreviation".
    """
    return (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("hamlet")
        or address.get("municipality")
        or ""
    )


def city_state(address: dict) -> str:
    city = _settlement_of(address) or address.get("suburb") or address.get("county") or ""
    state = _state_of(address)
    if city and state:
        return f"{city}, {state}"
    return city or state or ""


def geocode(query: str) -> Place:
    """Resolve a free-text location to a single Place."""
    if not query or not query.strip():
        raise GeoError("empty query")

    params = {"q": query.strip(), "format": "jsonv2", "limit": 1, "addressdetails": 1}
    try:
        with http_client() as c:
            r = c.get(f"{BASE}/search", params=params)
            r.raise_for_status()
            results = r.json()
    except httpx.HTTPError as exc:
        raise GeoError(f"geocoding service unavailable: {exc}") from exc

    if not results:
        raise GeoError(f"no match for {query!r}")

    hit = results[0]
    return Place(
        name=hit.get("display_name", query),
        lat=float(hit["lat"]),
        lng=float(hit["lon"]),
        city_state=city_state(hit.get("address", {})),
    )


def reverse(lat: float, lng: float) -> str:
    """Nearest city and state abbreviation — the Remarks column entry.

    Three tiers, because most HOS stops land on rural interstate where the point
    itself is in no town at all:

    1. Nominatim, if it names an actual city/town/village.
    2. Photon's nearest named place — the town a driver would write down.
    3. Nominatim's county or suburb, as a last resort.
    """
    params = {"lat": lat, "lon": lng, "format": "jsonv2", "zoom": 12, "addressdetails": 1}
    address: dict = {}
    try:
        with http_client() as c:
            r = c.get(f"{BASE}/reverse", params=params)
            r.raise_for_status()
            address = r.json().get("address", {})
    except httpx.HTTPError as exc:
        log.warning("reverse geocode failed at %s,%s: %s", lat, lng, exc)

    settlement, state = _settlement_of(address), _state_of(address)
    if settlement and state:
        return f"{settlement}, {state}"

    nearest = nearest_settlement(lat, lng)
    if nearest:
        return nearest

    return city_state(address)
