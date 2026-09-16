"""Writing a `PlannedTrip` to the database.

Split out from planning so the pipeline above stays free of the ORM, and so the
write path is one readable function per table rather than 100 lines of
`bulk_create` calls in the middle of the orchestration.
"""

from __future__ import annotations

from dataclasses import asdict

from django.db import transaction

from apps.geo import geometry
from apps.hos.types import DutyStatus

from ..models import DutySegment, LogDay, LogRemark, RouteLeg, Step, Stop, Trip
from .planning import PlannedTrip

# Fields the client may set that map straight onto the model.
PASSTHROUGH_FIELDS = (
    "driver_name",
    "co_driver_name",
    "carrier_name",
    "main_office_address",
    "home_terminal_address",
    "truck_number",
    "trailer_number",
    "shipper_commodity",
    "shipping_doc_no",
)


def _create_trip(data: dict, planned: PlannedTrip) -> Trip:
    return Trip.objects.create(
        current_location=data["current_location"],
        pickup_location=data["pickup_location"],
        dropoff_location=data["dropoff_location"],
        current_cycle_used=planned.cycle_used_start,
        start_datetime=planned.start,
        timezone=planned.timezone,
        allow_sleeper_split=bool(data.get("allow_sleeper_split")),
        **{f: data.get(f, "") for f in PASSTHROUGH_FIELDS},
        origin_lat=planned.origin.lat,
        origin_lng=planned.origin.lng,
        pickup_lat=planned.pickup.lat,
        pickup_lng=planned.pickup.lng,
        dropoff_lat=planned.dropoff.lat,
        dropoff_lng=planned.dropoff.lng,
        total_miles=planned.total_miles,
        drive_hours=planned.drive_hours,
        on_duty_hours=planned.on_duty_hours,
        elapsed_hours=planned.elapsed_hours,
        arrival_datetime=planned.arrival,
        cycle_used_end=planned.cycle_used_end,
        # A cross-country response carries tens of thousands of shape points; the
        # map cannot show that detail and the payload should not carry it.
        route_geometry=[list(p) for p in geometry.simplify(planned.geometry)],
        routing_provider=planned.routing_provider,
        is_compliant=not planned.violations,
        violations=[asdict(v) | {"at": v.at.isoformat()} for v in planned.violations],
    )


def _create_legs(trip: Trip, planned: PlannedTrip) -> None:
    endpoints = ((planned.origin, planned.pickup), (planned.pickup, planned.dropoff))
    RouteLeg.objects.bulk_create(
        RouteLeg(
            trip=trip,
            sequence=i,
            kind=kind,
            origin_lat=a.lat,
            origin_lng=a.lng,
            dest_lat=b.lat,
            dest_lng=b.lng,
            distance_mi=route.distance_mi,
            duration_hr=route.duration_hr,
        )
        for i, (kind, route, (a, b)) in enumerate(
            zip(("to_pickup", "to_dropoff"), planned.routes, endpoints, strict=True)
        )
    )


def _ordered_steps(planned: PlannedTrip):
    """Every routed leg ends with its own "Arrive at your destination".

    For the first leg that destination is the *pickup*, not the end of the trip,
    so keeping it makes the directions read as though the journey finishes twice —
    and it sorts into the middle of the second leg, since both share a mile
    marker. Only the final leg keeps its arrival.
    """
    for index, route in enumerate(planned.routes):
        steps = list(route.steps)
        if index < len(planned.routes) - 1:
            while steps and steps[-1].instruction.lower().startswith("arrive"):
                steps.pop()
        yield from steps


def _create_steps(trip: Trip, planned: PlannedTrip) -> None:
    Step.objects.bulk_create(
        Step(
            trip=trip,
            sequence=i,
            instruction=s.instruction,
            distance_mi=s.distance_mi,
            duration_hr=s.duration_hr,
            mile_marker=s.mile_marker,
        )
        for i, s in enumerate(_ordered_steps(planned))
    )


def _create_stops(trip: Trip, planned: PlannedTrip) -> None:
    Stop.objects.bulk_create(
        Stop(
            trip=trip,
            sequence=i,
            kind=e.kind,
            status=e.status.value,
            label=e.note,
            location=e.location,
            lat=e.lat,
            lng=e.lng,
            arrive_at=e.start,
            depart_at=e.end,
            duration_hr=round(e.hours, 4),
            mile_marker=e.mile_marker or 0.0,
        )
        for i, e in enumerate(e for e in planned.events if e.is_stop)
    )


def _create_log_days(trip: Trip, planned: PlannedTrip) -> None:
    for sheet in planned.sheets:
        day = LogDay.objects.create(
            trip=trip,
            day_index=sheet.day_index,
            date=sheet.date,
            total_off=sheet.totals[DutyStatus.OFF],
            total_sb=sheet.totals[DutyStatus.SB],
            total_driving=sheet.totals[DutyStatus.D],
            total_on_duty=sheet.totals[DutyStatus.ON],
            miles_driving_today=sheet.miles_driving_today,
            recap_on_duty_today=sheet.recap.on_duty_today,
            recap_last_7_days=sheet.recap.total_last_7_days,
            recap_available_tomorrow=sheet.recap.available_tomorrow,
            recap_last_8_days=sheet.recap.total_last_8_days,
            is_partial=sheet.is_partial,
        )
        DutySegment.objects.bulk_create(
            DutySegment(
                log_day=day,
                status=s.status.value,
                start_minute=s.start_minute,
                end_minute=s.end_minute,
                note=s.note,
            )
            for s in sheet.segments
        )
        LogRemark.objects.bulk_create(
            LogRemark(log_day=day, minute=r.minute, location=r.location, note=r.note)
            for r in sheet.remarks
        )


@transaction.atomic
def persist(data: dict, planned: PlannedTrip) -> Trip:
    """Store a planned trip and every row that hangs off it."""
    trip = _create_trip(data, planned)
    _create_legs(trip, planned)
    _create_steps(trip, planned)
    _create_stops(trip, planned)
    _create_log_days(trip, planned)
    return trip
