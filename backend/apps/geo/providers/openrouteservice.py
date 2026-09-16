"""OpenRouteService — the `driving-hgv` truck profile. Free key required.

The correct routing model for a CMV, and the reason this provider is preferred
over OSRM whenever `ORS_API_KEY` is set.
"""

from __future__ import annotations

from django.conf import settings

from .. import geometry
from .base import Route, Step, http_client

BASE = "https://api.openrouteservice.org/v2/directions"


def route(points: list[geometry.LatLng], mile_offset: float) -> Route:
    body = {
        "coordinates": [[lng, lat] for lat, lng in points],
        "units": "mi",
        "instructions": True,
    }
    with http_client(
        headers={
            "Authorization": settings.ORS_API_KEY,
            "Content-Type": "application/json",
        }
    ) as c:
        r = c.post(f"{BASE}/driving-hgv/geojson", json=body)
        r.raise_for_status()
        payload = r.json()

    feature = payload["features"][0]
    summary = feature["properties"]["summary"]
    coords = geometry.from_geojson(feature["geometry"]["coordinates"])

    steps: list[Step] = []
    running = mile_offset
    for segment in feature["properties"].get("segments", []):
        for step in segment.get("steps", []):
            dist = float(step.get("distance", 0.0))  # already miles (units=mi)
            steps.append(
                Step(
                    instruction=step.get("instruction", ""),
                    distance_mi=round(dist, 3),
                    duration_hr=round(float(step.get("duration", 0.0)) / 3600.0, 4),
                    mile_marker=round(running, 3),
                )
            )
            running += dist

    return Route(
        distance_mi=round(float(summary["distance"]), 2),
        duration_hr=round(float(summary["duration"]) / 3600.0, 4),
        geometry=coords,
        steps=steps,
        provider="openrouteservice/driving-hgv",
    )
