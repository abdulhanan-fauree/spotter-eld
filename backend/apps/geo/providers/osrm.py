"""OSRM public demo server — no key, car profile.

The fallback. A demo that dies because a free tier hiccuped is worse than one
that quietly routes a car, so `providers.route()` degrades to this rather than
failing.
"""

from __future__ import annotations

from .. import geometry
from .base import METERS_PER_MILE, GeoError, Route, Step, http_client

BASE = "https://router.project-osrm.org/route/v1/driving"


def build_instruction(step: dict) -> str:
    """Turn an OSRM maneuver into a sentence a driver would recognise.

    OSRM ships a maneuver type and modifier, not prose, so the phrasing is ours.
    Naively joining the parts gives "Right end of road onto south akard street";
    note also that `str.capitalize()` lowercases everything after the first
    character, which is what mangles the street name.

    "Route instructions" is named in the brief's Objective line, so this is a
    deliverable rather than a nicety.
    """
    man = step.get("maneuver", {})
    mtype = (man.get("type") or "").lower()
    mod = (man.get("modifier") or "").lower()
    name = (step.get("name") or "").strip()
    ref = (step.get("ref") or "").strip()
    road = name or ref
    onto = f" onto {road}" if road else ""

    if mod == "uturn":
        return f"Make a U-turn{onto}"

    match mtype:
        case "depart":
            return f"Start out{onto}" if road else "Start out"
        case "arrive":
            return "Arrive at your destination"
        case "turn":
            return f"Continue{onto}" if mod in ("", "straight") else f"Turn {mod}{onto}"
        case "new name" | "continue" | "notification":
            return f"Continue{onto}"
        case "merge":
            return f"Merge {mod}{onto}".replace("  ", " ") if mod else f"Merge{onto}"
        case "on ramp":
            return f"Take the ramp{onto}"
        case "off ramp":
            return f"Take the exit{onto}"
        case "fork":
            return f"Keep {mod or 'straight'}{onto}"
        case "end of road":
            return f"Turn {mod} at the end of the road{onto}" if mod else f"Continue{onto}"
        case "roundabout" | "rotary":
            exit_no = man.get("exit")
            return (
                f"At the roundabout, take exit {exit_no}{onto}"
                if exit_no
                else f"Enter the roundabout{onto}"
            )
        case "exit roundabout" | "exit rotary":
            return f"Exit the roundabout{onto}"

    fallback = " ".join(p for p in (mtype, mod) if p).strip()
    if not fallback:
        return f"Continue{onto}"
    # Uppercase the first letter only — capitalize() would flatten the road name.
    return (fallback[0].upper() + fallback[1:] + onto).strip()


def route(points: list[geometry.LatLng], mile_offset: float) -> Route:
    path = ";".join(f"{lng},{lat}" for lat, lng in points)
    params = {"overview": "full", "geometries": "geojson", "steps": "true"}
    with http_client() as c:
        r = c.get(f"{BASE}/{path}", params=params)
        r.raise_for_status()
        payload = r.json()

    if payload.get("code") != "Ok" or not payload.get("routes"):
        raise GeoError(f"OSRM returned {payload.get('code')}: {payload.get('message', '')}")

    route = payload["routes"][0]
    coords = geometry.from_geojson(route["geometry"]["coordinates"])

    steps: list[Step] = []
    running = mile_offset
    for leg in route.get("legs", []):
        for step in leg.get("steps", []):
            dist = float(step.get("distance", 0.0)) / METERS_PER_MILE
            steps.append(
                Step(
                    instruction=build_instruction(step),
                    distance_mi=round(dist, 3),
                    duration_hr=round(float(step.get("duration", 0.0)) / 3600.0, 4),
                    mile_marker=round(running, 3),
                )
            )
            running += dist

    return Route(
        distance_mi=round(float(route["distance"]) / METERS_PER_MILE, 2),
        duration_hr=round(float(route["duration"]) / 3600.0, 4),
        geometry=coords,
        steps=steps,
        provider="osrm/driving",
    )
