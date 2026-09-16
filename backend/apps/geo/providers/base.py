"""Shared HTTP plumbing and value types for the geo providers."""

from __future__ import annotations

from dataclasses import dataclass, field

import httpx
from django.conf import settings

METERS_PER_MILE = 1609.344


class GeoError(RuntimeError):
    """A geo service failed or returned nothing usable."""


@dataclass(frozen=True)
class Place:
    name: str
    lat: float
    lng: float
    city_state: str  # "Amarillo, TX" — what goes in the Remarks column

    @property
    def latlng(self) -> tuple[float, float]:
        return (self.lat, self.lng)


@dataclass(frozen=True)
class Step:
    """One turn-by-turn instruction.

    `mile_marker` is cumulative from the start of the *trip*, the same axis the
    planner's events use — so the UI merges directions and HOS stops with one sort.
    """

    instruction: str
    distance_mi: float
    duration_hr: float
    mile_marker: float


@dataclass(frozen=True)
class Route:
    distance_mi: float
    duration_hr: float
    geometry: list[tuple[float, float]]
    steps: list[Step] = field(default_factory=list)
    provider: str = ""


def http_client(*, headers: dict | None = None, **kwargs) -> httpx.Client:
    """An httpx client carrying the identifying User-Agent Nominatim requires.

    `headers` is merged, not passed through: a caller supplying its own headers
    (ORS needs an Authorization header) must not collide with the default.
    """
    merged = {"User-Agent": settings.GEO_USER_AGENT}
    if headers:
        merged.update(headers)
    return httpx.Client(
        timeout=settings.GEO_TIMEOUT_SECONDS,
        headers=merged,
        follow_redirects=True,
        **kwargs,
    )
