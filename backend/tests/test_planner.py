"""Planner behaviour: the scenarios from the build plan's test matrix.

Every timeline the planner produces is fed through the independent validator in
`validate.py`, which re-derives all four clocks from scratch. Two implementations
having to agree is the point.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from apps.hos.planner import plan_trip
from apps.hos.rules import DEFAULT_RULES
from apps.hos.splitter import split_days
from apps.hos.types import DutyStatus, LegInput, PlanInput
from apps.hos.validate import validate_timeline

TZ = ZoneInfo("America/Chicago")
START = datetime(2026, 8, 3, 6, 0, tzinfo=TZ)  # a Monday, 06:00
SPEED = 55.0

D, ON, OFF, SB = DutyStatus.D, DutyStatus.ON, DutyStatus.OFF, DutyStatus.SB


def leg(kind: str, miles: float, label: str) -> LegInput:
    return LegInput(kind=kind, distance_mi=miles, duration_hr=miles / SPEED, dest_label=label)


def trip(to_pickup: float, to_dropoff: float, cycle_used: float = 0.0) -> PlanInput:
    return PlanInput(
        start=START,
        cycle_used_hr=cycle_used,
        legs=(leg("to_pickup", to_pickup, "Pickup, TX"), leg("to_dropoff", to_dropoff, "Dropoff, IL")),
    )


def notes(plan) -> list[str]:
    return [e.note for e in plan.events if e.note]


# --------------------------------------------------------------------------- #
# Universal invariants
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "to_pickup,to_dropoff,cycle",
    [
        (60, 180, 0),
        (240, 600, 0),
        (150, 1100, 0),
        (300, 2200, 0),
        (400, 2400, 60),
        (100, 500, 70),
        (50, 80, 68.5),
    ],
)
def test_every_plan_is_compliant(to_pickup, to_dropoff, cycle):
    plan = plan_trip(trip(to_pickup, to_dropoff, cycle))
    assert validate_timeline(plan.events, cycle_used_start=cycle) == []


@pytest.mark.parametrize("to_pickup,to_dropoff", [(60, 180), (240, 600), (300, 2200)])
def test_timeline_is_gapless(to_pickup, to_dropoff):
    plan = plan_trip(trip(to_pickup, to_dropoff))
    for a, b in zip(plan.events, plan.events[1:], strict=False):
        assert a.end == b.start


@pytest.mark.parametrize("to_pickup,to_dropoff", [(60, 180), (240, 600), (300, 2200)])
def test_all_miles_are_driven(to_pickup, to_dropoff):
    plan = plan_trip(trip(to_pickup, to_dropoff))
    assert plan.total_miles == pytest.approx(to_pickup + to_dropoff, abs=0.5)


# --------------------------------------------------------------------------- #
# Short haul: no rest needed, one sheet
# --------------------------------------------------------------------------- #


def test_short_haul_needs_no_rest():
    plan = plan_trip(trip(60, 180))
    assert "10-hour rest" not in notes(plan)
    assert "30-minute rest break" not in notes(plan)
    assert len(split_days(plan.events, TZ)) == 1


def test_pickup_and_dropoff_are_one_hour_each():
    plan = plan_trip(trip(60, 180))
    stops = [e for e in plan.events if e.note in ("Pickup", "Dropoff")]
    assert [e.hours for e in stops] == [1.0, 1.0]
    assert all(e.status is ON for e in stops)


# --------------------------------------------------------------------------- #
# The 30-minute break, § 395.3(a)(3)(ii)
# --------------------------------------------------------------------------- #


def _driving_since_last_qualifying_break(plan, before_index: int) -> float:
    """Driving hours accumulated since the last >= 30-min non-driving period."""
    driving = 0.0
    for e in plan.events[:before_index]:
        if e.status is D:
            driving += e.hours
        elif e.hours >= DEFAULT_RULES.break_len:
            driving = 0.0
    return driving


def test_break_appears_after_eight_cumulative_driving_hours():
    """A ~600 mi run drives past 8 hours and must break before continuing.

    The counter is driving hours since the last >= 30-minute non-driving period,
    NOT driving hours since the start of the shift -- the 1-hour pickup earlier in
    this trip already cleared it once.
    """
    plan = plan_trip(trip(50, 550))
    assert "30-minute rest break" in notes(plan)

    idx = next(i for i, e in enumerate(plan.events) if e.note == "30-minute rest break")
    assert _driving_since_last_qualifying_break(plan, idx) == pytest.approx(
        DEFAULT_RULES.drive_before_break, abs=1e-6
    )


def test_no_break_is_emitted_straight_after_another_non_driving_period():
    """The redundant-break bug: a >= 30-min stop already satisfies the requirement.

    "a driver could take 15 minutes of on-duty not driving time plus 15 minutes of
    off-duty time to satisfy his or her 30-minute requirement" -- guide p.10. So a
    fuel stop or a 1-hour pickup counts, and emitting a break immediately after one
    would be visibly wrong to anyone who drives.
    """
    for to_pickup, to_dropoff in [(50, 1050), (200, 2300), (430, 430), (300, 2200)]:
        plan = plan_trip(trip(to_pickup, to_dropoff))
        for prev, cur in zip(plan.events, plan.events[1:], strict=False):
            if cur.note == "30-minute rest break":
                assert prev.status is D, (
                    f"break emitted after a {prev.hours:.2f}h {prev.status} period "
                    f"({prev.note!r}) which already satisfied it"
                )


def test_pickup_absorbs_the_break():
    """~7.8 h driving either side of a 1-hour pickup: no break should be needed."""
    plan = plan_trip(trip(430, 430))
    assert "30-minute rest break" not in notes(plan)
    assert validate_timeline(plan.events) == []


def test_a_fuel_stop_clears_the_eight_hour_counter():
    """Unit-level proof of the same invariant, straight on the clocks."""
    from apps.hos.clocks import Clocks

    c = Clocks().after(D, 7.5)
    assert c.since_break == pytest.approx(7.5)
    assert c.after(ON, DEFAULT_RULES.fuel_len).since_break == 0.0
    assert c.after(ON, DEFAULT_RULES.pickup_len).since_break == 0.0
    # ... but a stop shorter than 30 minutes does not
    assert c.after(ON, 0.25).since_break == pytest.approx(7.5)


# --------------------------------------------------------------------------- #
# Fueling, per the brief's assumption
# --------------------------------------------------------------------------- #


def test_fuel_stop_every_thousand_miles():
    plan = plan_trip(trip(200, 2300))  # 2,500 mi -> stops at 1,000 and 2,000
    fuel = [e for e in plan.events if e.note == "Fueling"]
    assert len(fuel) == 2
    assert [round(e.mile_marker) for e in fuel] == [1000, 2000]


def test_fueling_is_on_duty_not_driving():
    """"inspecting, servicing, or conditioning any truck, including fueling it" -- p.5."""
    plan = plan_trip(trip(200, 1000))
    assert all(e.status is ON for e in plan.events if e.note == "Fueling")


# --------------------------------------------------------------------------- #
# The 11- and 14-hour clocks
# --------------------------------------------------------------------------- #


def test_never_drives_more_than_eleven_hours_between_resets():
    plan = plan_trip(trip(300, 2200))
    driving = 0.0
    for e in plan.events:
        if e.status.is_rest and e.hours >= DEFAULT_RULES.reset_off:
            driving = 0.0
        elif e.status is D:
            driving += e.hours
        assert driving <= DEFAULT_RULES.max_drive_per_shift + 1e-6


def test_ten_hour_rest_is_logged_in_the_sleeper_berth():
    plan = plan_trip(trip(300, 2200))
    rests = [e for e in plan.events if e.note == "10-hour rest"]
    assert rests
    assert all(e.status is SB for e in rests)
    assert all(e.hours == pytest.approx(10.0) for e in rests)


# --------------------------------------------------------------------------- #
# The 70-hour cycle and the 34-hour restart, § 395.3(b)-(c)
# --------------------------------------------------------------------------- #


def test_long_trip_with_spent_cycle_inserts_a_34_hour_restart():
    plan = plan_trip(trip(400, 2400), )
    plan = plan_trip(
        PlanInput(
            start=START,
            cycle_used_hr=60.0,
            legs=(leg("to_pickup", 400, "Pickup, TX"), leg("to_dropoff", 2400, "Dropoff, NJ")),
        )
    )
    restarts = [e for e in plan.events if e.note == "34-hour restart"]
    assert len(restarts) >= 1
    assert all(e.hours == pytest.approx(DEFAULT_RULES.restart) for e in restarts)
    assert all(e.status is OFF for e in restarts)
    assert validate_timeline(plan.events, cycle_used_start=60.0) == []


def test_restart_resets_the_cycle_to_zero():
    plan = plan_trip(
        PlanInput(
            start=START,
            cycle_used_hr=60.0,
            legs=(leg("to_pickup", 400, "P"), leg("to_dropoff", 2400, "D")),
        )
    )
    idx = next(i for i, e in enumerate(plan.events) if e.note == "34-hour restart")
    on_duty_after = sum(e.hours for e in plan.events[idx + 1 :] if e.status.is_on_duty)
    assert on_duty_after <= DEFAULT_RULES.cycle_limit + 1e-6


def test_cycle_already_at_the_limit_restarts_before_driving():
    """cycle_used = 70 leaves no hours at all: the restart must come first."""
    plan = plan_trip(trip(100, 500, cycle_used=70.0))
    first_drive = next(i for i, e in enumerate(plan.events) if e.status is D)
    first_restart = next(i for i, e in enumerate(plan.events) if e.note == "34-hour restart")
    assert first_restart < first_drive


# --------------------------------------------------------------------------- #
# Multi-day splitting
# --------------------------------------------------------------------------- #


def test_long_trip_produces_multiple_sheets():
    plan = plan_trip(trip(300, 2200))
    sheets = split_days(plan.events, TZ)
    assert len(sheets) >= 4


@pytest.mark.parametrize(
    "to_pickup,to_dropoff,cycle", [(60, 180, 0), (300, 2200, 0), (400, 2400, 60), (100, 500, 70)]
)
def test_every_sheet_totals_exactly_24_hours(to_pickup, to_dropoff, cycle):
    """"The total of the entries must equal 24 hours" -- guide p.16.

    Guards against float drift and against gaps: time before the trip opens and
    after it closes is off duty and must be drawn, or the sheet silently fails to
    add up.
    """
    plan = plan_trip(trip(to_pickup, to_dropoff, cycle))
    for sheet in split_days(plan.events, TZ):
        assert sheet.total_hours == pytest.approx(24.0, abs=1e-6), f"day {sheet.day_index}"


def test_sheets_are_gapless_and_cover_midnight_to_midnight():
    plan = plan_trip(trip(300, 2200))
    for sheet in split_days(plan.events, TZ):
        assert sheet.segments[0].start_minute == 0
        assert sheet.segments[-1].end_minute == 1440
        for a, b in zip(sheet.segments, sheet.segments[1:], strict=False):
            assert a.end_minute == b.start_minute


def test_sheet_dates_are_consecutive():
    plan = plan_trip(trip(300, 2200))
    sheets = split_days(plan.events, TZ)
    for a, b in zip(sheets, sheets[1:], strict=False):
        assert b.date - a.date == timedelta(days=1)


def test_events_crossing_midnight_are_split():
    plan = plan_trip(trip(300, 2200))
    sheets = split_days(plan.events, TZ)
    for sheet in sheets:
        assert sheet.segments[0].start_minute == 0 or sheet.day_index == 1
        for s in sheet.segments:
            assert 0 <= s.start_minute < s.end_minute <= 1440


# --------------------------------------------------------------------------- #
# Recap band
# --------------------------------------------------------------------------- #


def test_recap_box_c_tracks_the_cycle():
    """Box C is on-duty hours in the current 8-day window -- the app's input."""
    plan = plan_trip(trip(200, 900, cycle_used=20.0))
    sheets = split_days(plan.events, TZ, cycle_used_start=20.0)
    assert sheets[0].recap.total_last_8_days == pytest.approx(
        20.0 + sheets[0].recap.on_duty_today
    )


def test_recap_box_b_is_seventy_minus_a():
    plan = plan_trip(trip(200, 900, cycle_used=20.0))
    for sheet in split_days(plan.events, TZ, cycle_used_start=20.0):
        assert sheet.recap.available_tomorrow == pytest.approx(
            max(0.0, 70.0 - sheet.recap.total_last_7_days)
        )


@pytest.mark.parametrize("cycle", [0.0, 20.0, 60.0, 70.0])
def test_recap_box_c_does_not_grow_without_bound(cycle):
    """Regression: box C is a rolling total, not a running sum.

    A 34-hour restart zeroes it mid-trip (guide p.11). Accumulating daily on-duty
    totals without honouring that reset reported 94.68 hours used on a trip whose
    driver had legally restarted -- a number that cannot exist.

    Note C may sit *slightly* above 70: on-duty non-driving work is never blocked,
    so a pre-trip inspection or a dropoff can legitimately carry it past the limit
    (see the test below). What it must not do is climb day after day.
    """
    plan = plan_trip(trip(400, 2400, cycle))
    sheets = split_days(plan.events, TZ, cycle_used_start=cycle)
    ceiling = DEFAULT_RULES.cycle_limit + DEFAULT_RULES.max_window
    for sheet in sheets:
        assert sheet.recap.total_last_8_days <= ceiling, (
            f"day {sheet.day_index}: C={sheet.recap.total_last_8_days}"
        )


@pytest.mark.parametrize("cycle", [0.0, 60.0, 70.0])
def test_cycle_is_only_exceeded_by_non_driving_work(cycle):
    """"Once you reach the limit, you can do other work, but you are not permitted
    to drive." -- guide p.10

    So the invariant is not "C <= 70", it is "no driving begins at or past 70".
    At cycle_used = 70.0 the pre-trip inspection legitimately carries C to 70.25.
    """
    plan = plan_trip(trip(400, 2400, cycle))
    running = cycle
    for e in plan.events:
        if e.status is D:
            assert running < DEFAULT_RULES.cycle_limit + 1e-6, (
                f"began driving at {running:.2f} cycle hours"
            )
        if e.status.is_rest and e.hours >= DEFAULT_RULES.restart:
            running = 0.0
        elif e.status.is_on_duty:
            running += e.hours


def test_recap_resets_after_a_34_hour_restart():
    plan = plan_trip(trip(400, 2400, cycle_used=60.0))
    sheets = split_days(plan.events, TZ, cycle_used_start=60.0)
    peak = max(s.recap.total_last_8_days for s in sheets)
    after = [s.recap.total_last_8_days for s in sheets][-1]
    assert peak == pytest.approx(70.0, abs=1e-6)  # hits the wall
    assert after < peak  # and comes back down


def test_final_recap_agrees_with_the_planner():
    """The splitter and the planner must derive the same end-of-trip cycle usage."""
    for cycle in (0.0, 30.0, 60.0):
        plan = plan_trip(trip(400, 2400, cycle))
        sheets = split_days(plan.events, TZ, cycle_used_start=cycle)
        assert sheets[-1].recap.total_last_8_days == pytest.approx(
            plan.cycle_used_end, abs=1e-4
        )


def test_recap_on_duty_today_is_lines_3_and_4():
    plan = plan_trip(trip(200, 900))
    for sheet in split_days(plan.events, TZ):
        assert sheet.recap.on_duty_today == pytest.approx(
            sheet.totals[D] + sheet.totals[ON]
        )
