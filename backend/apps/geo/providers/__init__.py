"""Geo providers, and the policy for choosing between them.

    geocode / reverse   Nominatim (no key, 1 req/sec, needs a real User-Agent)
    autocomplete        Photon    (no key, tolerant of partial input)
    routing             OpenRouteService `driving-hgv` -> OSRM demo

Every call goes out from the server; the ORS key must never reach the browser.
Both routing providers are asked for GeoJSON geometry so nothing has to decode a
polyline — the only cost is remembering that GeoJSON is [lng, lat].
"""

from __future__ import annotations

import logging

import httpx
from django.conf import settings

from .. import geometry
from . import openrouteservice, osrm, photon
from . import nominatim
from .base import GeoError, Place, Route, Step
from .nominatim import BASE as NOMINATIM
from .nominatim import city_state as _city_state_from_nominatim
from .osrm import build_instruction as _osrm_instruction
from .photon import FALLBACK_PLACES, PREFERRED_PLACES
from .photon import REVERSE as PHOTON_REVERSE
from .photon import SEARCH as PHOTON
from .photon import nearest_settlement as _reverse_photon

log = logging.getLogger(__name__)

__all__ = ["GeoError", "Place", "Route", "Step", "geocode", "reverse", "suggest", "route"]

geocode = nominatim.geocode
reverse = nominatim.reverse
suggest = photon.suggest


def route(points: list[geometry.LatLng], *, mile_offset: float = 0.0) -> Route:
    """Route through `points`, preferring the truck profile.

    `mile_offset` is the cumulative trip mileage at the start of this leg, so the
    returned steps carry trip-absolute mile markers and can be interleaved with
    the planner's stops.
    """
    if len(points) < 2:
        raise GeoError("need at least two points to route")

    if settings.ORS_API_KEY:
        try:
            return openrouteservice.route(points, mile_offset)
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            log.warning("ORS routing failed, falling back to OSRM: %s", exc)

    try:
        return osrm.route(points, mile_offset)
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        raise GeoError(f"routing unavailable: {exc}") from exc
