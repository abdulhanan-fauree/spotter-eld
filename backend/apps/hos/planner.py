"""The trip simulator: route legs in, a legal duty timeline out.

Event-loop, not a fixed time step -- each iteration jumps straight to whichever
constraint boundary comes first (a clock running out, the next fuel stop, or the
end of the leg), so a five-day trip costs a few dozen iterations rather than
thousands.

The four invariants that make the output *correct* live in `clocks.py`; this
module is only responsible for deciding what to do when the driver runs out of
road or out of hours.
"""

from __future__ import annotations

from datetime import timedelta

from .clocks import Clocks
from .rules import DEFAULT_RULES, Rules
from .types import DutyStatus, Event, LegInput, Plan, PlanInput, StopKind

EPS = 1e-6
MAX_ITERATIONS = 10_000  # runaway guard; a legitimate trip needs far fewer

D, ON, OFF, SB = DutyStatus.D, DutyStatus.ON, DutyStatus.OFF, DutyStatus.SB


def _average_speed(leg: LegInput, rules: Rules) -> float:
    """Miles per hour implied by the routing API, clamped to something physical.

    Using the API's own duration keeps terrain and traffic in the estimate, but a
    bad response should not be able to produce a 200 mph plan.
    """
    if leg.duration_hr <= 0:
        return (rules.min_speed_mph + rules.max_speed_mph) / 2
    raw = leg.distance_mi / leg.duration_hr
    return min(max(raw, rules.min_speed_mph), rules.max_speed_mph)


def plan_trip(inp: PlanInput, rules: Rules = DEFAULT_RULES) -> Plan:
    events: list[Event] = []
    clock = inp.start
    clocks = Clocks(cycle_used=inp.cycle_used_hr, rules=rules)
    cumulative_mi = 0.0
    miles_to_fuel = rules.fuel_interval_mi

    def emit(
        status: DutyStatus,
        hours: float,
        note: str = "",
        *,
        kind: str = "",
        location: str = "",
        miles: float = 0.0,
        is_stop: bool = False,
    ) -> None:
        nonlocal clock, clocks, cumulative_mi
        if hours <= EPS:
            return
        end = clock + timedelta(hours=hours)
        events.append(
            Event(
                status=status,
                start=clock,
                end=end,
                note=note,
                kind=kind,
                location=location,
                mile_marker=round(cumulative_mi, 3),
                is_stop=is_stop,
                miles=round(miles, 3),
            )
        )
        clocks = clocks.after(status, hours)
        cumulative_mi += miles
        clock = end

    # Pre-trip inspection, on duty. Mirrors the FMCSA sample log (p.18), and it is
    # what opens the 14-hour window.
    emit(ON, rules.pretrip_len, "Pre-trip inspection", kind=StopKind.PRE_TRIP, is_stop=True)

    for leg in inp.legs:
        speed = _average_speed(leg, rules)
        remaining = leg.distance_mi
        guard = 0

        while remaining > EPS:
            guard += 1
            if guard > MAX_ITERATIONS:  # pragma: no cover - defensive
                raise RuntimeError("planner failed to converge; check leg distances and rules")

            # 70-hour wall: only a 34-hour restart clears it. § 395.3(c).
            if clocks.cycle_exhausted():
                emit(OFF, rules.restart, "34-hour restart", kind=StopKind.RESTART_34, is_stop=True)
                continue

            drivable = clocks.drivable_hours()

            if drivable <= EPS:
                if clocks.needs_break_only():
                    # The 8-hour driving counter is the only thing blocking us.
                    emit(OFF, rules.break_len, "30-minute rest break", kind=StopKind.BREAK_30, is_stop=True)
                    continue

                # NOTE: § 395.1(g) split sleeper berth is deliberately NOT used here.
                #
                # The split only helps when the *14-hour window* is the binding
                # constraint while driving hours remain — and to drive between the
                # two halves, the first half must already be excluded from the
                # window, which is only true once the pair is complete. Resolving
                # that needs lookahead: the planner has to decide to rest before it
                # is forced to, and commit to a pairing it has not reached yet.
                #
                # An earlier attempt emitted 7h SB immediately followed by 3h off.
                # That is legal, but the two periods were *consecutive* — which is
                # a plain 10-hour reset drawn as two rows, not a split, and
                # labelling it one would misrepresent the log. Correctness beats a
                # cosmetic feature, so the planner takes the honest 10-hour reset.
                #
                # `sleeper.py` implements the § 395.1(g) accounting and is pinned by
                # the guide's worked example; `validate.py` uses it to *check*
                # split timelines. What is missing is a planner that *produces* one.
                # 11-hour or 14-hour clock exhausted: a full 10-hour reset.
                # Logged in the sleeper berth, as an OTR driver would.
                emit(SB, rules.reset_off, "10-hour rest", kind=StopKind.REST_10, is_stop=True)
                continue

            # Drive to the nearest boundary: hours available, next fuel stop, or
            # the end of the leg.
            hours = min(drivable, miles_to_fuel / speed, remaining / speed)
            miles = hours * speed
            emit(D, hours, miles=miles)
            remaining -= miles
            miles_to_fuel -= miles

            if miles_to_fuel <= EPS:
                # On-duty time: "inspecting, servicing, or conditioning any truck,
                # including fueling it" (guide p.5). Being >= 30 minutes it also
                # satisfies the 30-minute break (p.10) -- handled in Clocks.after.
                emit(ON, rules.fuel_len, "Fueling", kind=StopKind.FUEL, is_stop=True)
                miles_to_fuel = rules.fuel_interval_mi

        # Arrival. On-duty non-driving work is legal however late in the shift it
        # falls, so this is emitted unconditionally. Guide p.9.
        default_len = rules.pickup_len if leg.kind == "to_pickup" else rules.dropoff_len
        emit(
            leg.dest_action,
            leg.dest_duration_hr if leg.dest_duration_hr is not None else default_len,
            "Pickup" if leg.kind == "to_pickup" else "Dropoff",
            kind=StopKind.PICKUP if leg.kind == "to_pickup" else StopKind.DROPOFF,
            location=leg.dest_label,
            is_stop=True,
        )

    drive_hours = sum(e.hours for e in events if e.status is D)
    on_duty_hours = sum(e.hours for e in events if e.status.is_on_duty)

    return Plan(
        events=tuple(events),
        total_miles=round(cumulative_mi, 1),
        drive_hours=round(drive_hours, 4),
        on_duty_hours=round(on_duty_hours, 4),
        elapsed_hours=round((clock - inp.start).total_seconds() / 3600.0, 4),
        arrival=clock,
        cycle_used_start=inp.cycle_used_hr,
        cycle_used_end=round(clocks.cycle_used, 4),
    )
