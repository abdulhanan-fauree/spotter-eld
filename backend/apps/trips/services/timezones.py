"""Resolving the home-terminal time zone."""

from __future__ import annotations

import logging
from functools import lru_cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

log = logging.getLogger(__name__)

DEFAULT_TZ = "America/Chicago"


@lru_cache(maxsize=1)
def _timezone_finder():
    """Loaded once per process; construction reads ~65 MB of boundary data."""
    from timezonefinder import TimezoneFinder

    return TimezoneFinder()


def resolve_timezone(lat: float, lng: float, override: str = "") -> str:
    """The home-terminal zone.

    Strictly this is a carrier setting — "You must use the time zone in effect at
    your home terminal" (guide p.16) — so an explicit override always wins. It
    defaults from the trip's origin because that is the best guess available from
    the brief's four inputs.
    """
    if override:
        try:
            ZoneInfo(override)
            return override
        except (ZoneInfoNotFoundError, ValueError):
            log.warning("unknown timezone %r, falling back", override)

    try:
        found = _timezone_finder().timezone_at(lat=lat, lng=lng)
        if found:
            return found
    except Exception as exc:  # pragma: no cover - defensive
        log.warning("timezone lookup failed: %s", exc)
    return DEFAULT_TZ
