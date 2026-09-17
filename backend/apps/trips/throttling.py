"""Per-address rate limits for the endpoints that call external services.

Rates live in `REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]` under each class's
`scope`. `API_THROTTLING = False` turns every limit off, which the test suite
relies on.
"""

from __future__ import annotations

from django.conf import settings
from rest_framework.throttling import AnonRateThrottle


class _SwitchableThrottle(AnonRateThrottle):
    def allow_request(self, request, view) -> bool:
        if not getattr(settings, "API_THROTTLING", True):
            return True
        return super().allow_request(request, view)


class PlanningThrottle(_SwitchableThrottle):
    """`POST /api/trips/`: geocoding plus routing per call."""

    scope = "plan"


class GeocodeThrottle(_SwitchableThrottle):
    """`GET /api/geocode/`: one Nominatim request per keystroke burst."""

    scope = "geocode"
