"""Turning three addresses into a planned, validated trip.

Pure orchestration: geocode -> route -> simulate -> annotate -> split -> validate.
Nothing here touches the database, so the whole pipeline can be exercised with the
geo layer stubbed and no migrations.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from django.utils import timezone as dj_timezone

from apps.geo import service as geo
from apps.geo.providers import Place, Route
from apps.hos.planner import plan_trip
from apps.hos.splitter import split_days
from apps.hos.types import Event, LegInput, LogSheet, PlanInput, Violation
from apps.hos.validate import validate_timeline

from .timezones import resolve_timezone


class PlanningError(RuntimeError):
    """A trip could not be planned — bad address, no route, service down."""


@dataclass(frozen=True)
class PlannedTrip:
    """Everything the persistence layer needs, and nothing it does not."""

    origin: Place
    pickup: Place
    dropoff: Place
    routes: tuple[Route, ...]
    geometry: list[tuple[float, float]]
    timezone: str
    start: datetime
    events: tuple[Event, ...]
    sheets: list[LogSheet]
    violations: list[Violation]
    total_miles: float
    drive_hours: float
    on_duty_hours: float
    elapsed_hours: float
    arrival: datetime
    cycle_used_start: float
    cycle_used_end: float

    @property
    def routing_provider(self) -> str:
        return self.routes[-1].provider if self.routes else ""


def _geocode_endpoints(data: dict) -> tuple[Place, Place, Place]:
    try:
        return (
            geo.geocode(data["current_location"]),
            geo.geocode(data["pickup_location"]),
            geo.geocode(data["dropoff_location"]),
        )
    except geo.GeoError as exc:
        raise PlanningError(str(exc)) from exc


def _route_legs(origin: Place, pickup: Place, dropoff: Place) -> tuple[Route, Route]:
    try:
        to_pickup = geo.route([origin.latlng, pickup.latlng], mile_offset=0.0)
        to_dropoff = geo.route([pickup.latlng, dropoff.latlng], mile_offset=to_pickup.distance_mi)
    except geo.GeoError as exc:
        raise PlanningError(str(exc)) from exc
    return to_pickup, to_dropoff


def _leg_inputs(routes: tuple[Route, Route], pickup: Place, dropoff: Place, data: dict):
    to_pickup, to_dropoff = routes
    return (
        LegInput(
            kind="to_pickup",
            distance_mi=to_pickup.distance_mi,
            duration_hr=to_pickup.duration_hr,
            dest_label=pickup.city_state or data["pickup_location"],
        ),
        LegInput(
            kind="to_dropoff",
            distance_mi=to_dropoff.distance_mi,
            duration_hr=to_dropoff.duration_hr,
            dest_label=dropoff.city_state or data["dropoff_location"],
        ),
    )


def plan(data: dict) -> PlannedTrip:
    """Run the full pipeline. Raises `PlanningError` on any unusable input."""
    origin, pickup, dropoff = _geocode_endpoints(data)
    routes = _route_legs(origin, pickup, dropoff)
    full_geometry = routes[0].geometry + routes[1].geometry

    tz_name = resolve_timezone(origin.lat, origin.lng, data.get("timezone", ""))
    tz = ZoneInfo(tz_name)
    start = (data.get("start_datetime") or dj_timezone.now()).astimezone(tz)

    cycle_used = float(data["current_cycle_used"])
    allow_split = bool(data.get("allow_sleeper_split"))
    result = plan_trip(
        PlanInput(
            start=start,
            cycle_used_hr=cycle_used,
            legs=_leg_inputs(routes, pickup, dropoff, data),
            allow_sleeper_split=allow_split,
        )
    )

    # Without this every synthesised stop (fuel, breaks, rests) has a blank
    # location and the Remarks column comes out empty.
    events = geo.annotate_stops(result.events, full_geometry, result.total_miles)

    return PlannedTrip(
        origin=origin,
        pickup=pickup,
        dropoff=dropoff,
        routes=routes,
        geometry=full_geometry,
        timezone=tz_name,
        start=start,
        events=events,
        sheets=split_days(events, tz, cycle_used_start=cycle_used),
        violations=validate_timeline(
            events, cycle_used_start=cycle_used, allow_sleeper_split=allow_split
        ),
        total_miles=result.total_miles,
        drive_hours=result.drive_hours,
        on_duty_hours=result.on_duty_hours,
        elapsed_hours=result.elapsed_hours,
        arrival=result.arrival,
        cycle_used_start=cycle_used,
        cycle_used_end=result.cycle_used_end,
    )
