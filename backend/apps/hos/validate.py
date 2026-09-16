"""Independent compliance checker.

This module deliberately shares no code with `planner.py`. The planner *constructs*
a legal timeline; this walks a finished timeline and re-derives every clock from
scratch to see whether it actually is one. Two implementations disagreeing is the
signal we want, so resist any urge to factor the common parts out.

It feeds the "HOS Compliant - 0 violations" badge in the UI and doubles as the
oracle for the planner's own tests.

The one rule that governs everything here (guide pp.9-10):

    "you are allowed to do non-driving work after the 14-hour limit is reached,
     just no more driving of the truck on the highway"
    "Violations of the 60/7 or 70/8 hour rules can only occur if you *drive*
     past these limits"

So every check below is armed only while the driver is DRIVING. On-duty
non-driving work never produces a violation, however late in the shift it falls.
"""

from __future__ import annotations

from datetime import datetime

from .rules import DEFAULT_RULES, Rules
from .types import DutyStatus, Event, Violation

EPS = 1e-6


def validate_timeline(
    events: tuple[Event, ...] | list[Event],
    *,
    cycle_used_start: float = 0.0,
    rules: Rules = DEFAULT_RULES,
    allow_sleeper_split: bool = False,
) -> list[Violation]:
    """Return every HOS violation in `events`, in chronological order.

    With `allow_sleeper_split`, the 11- and 14-hour limits are judged against
    § 395.1(g) calculation periods rather than a single forward-running shift
    clock — a driver legally using the split accrues more than 11 hours between
    full resets, and the simple walk below would report that as a violation.
    """
    if allow_sleeper_split:
        return _validate_split(events, cycle_used_start, rules)
    return _validate_simple(events, cycle_used_start, rules)


def _validate_split(
    events: tuple[Event, ...] | list[Event],
    cycle_used_start: float,
    rules: Rules,
) -> list[Violation]:
    """§ 395.1(g) compliance: per-pairing calculation periods.

    Delegates the 11/14 accounting to `sleeper.analyse`, which is pinned by the
    guide's own worked example (pp.8-9). The cycle and the 30-minute break are
    unaffected by the split, so they are still checked by the forward walk.
    """
    from .sleeper import analyse

    violations = [
        v
        for v in _validate_simple(events, cycle_used_start, rules)
        if v.kind in ("70_hour_cycle", "30_minute_break")
    ]

    if not events:
        return violations

    _, periods = analyse(events, clock_start=events[0].start, rules=rules)
    for period in periods:
        for problem in period.violations:
            kind = "11_hour_driving" if "driving" in problem else "14_hour_window"
            limit = rules.max_drive_per_shift if kind == "11_hour_driving" else rules.max_window
            violations.append(
                Violation(
                    kind=kind,
                    at=period.start,
                    detail=f"§ 395.1(g) calculation period {period.index}: {problem}",
                    limit=limit,
                    actual=period.driving_hours if kind == "11_hour_driving" else period.on_duty_hours,
                )
            )

    return sorted(violations, key=lambda v: v.at)


def _validate_simple(
    events: tuple[Event, ...] | list[Event],
    cycle_used_start: float,
    rules: Rules,
) -> list[Violation]:
    """The standard forward walk: one shift clock, reset only by 10+ hours off."""
    violations: list[Violation] = []

    drive_today = 0.0
    since_break = 0.0
    cycle_used = cycle_used_start
    window_start: datetime | None = None

    def window_used(at: datetime) -> float:
        if window_start is None:
            return 0.0
        return (at - window_start).total_seconds() / 3600.0

    for ev in events:
        hours = ev.hours
        if hours <= 0:
            continue

        # --- rest periods: resets ------------------------------------------- #
        if ev.status.is_rest:
            if hours >= rules.restart - EPS:
                drive_today = since_break = cycle_used = 0.0
                window_start = None
            elif hours >= rules.reset_off - EPS:
                drive_today = since_break = 0.0
                window_start = None
            elif hours >= rules.break_len - EPS:
                since_break = 0.0
            continue

        # --- the 14-hour window opens at the first on-duty minute ----------- #
        if window_start is None:
            window_start = ev.start

        if ev.status is DutyStatus.ON:
            # On-duty non-driving is always permitted. It accrues to the cycle
            # but can never itself be a violation.
            if hours >= rules.break_len - EPS:
                since_break = 0.0
            cycle_used += hours
            continue

        # --- driving: every limit is armed ---------------------------------- #
        assert ev.status is DutyStatus.D

        if drive_today + hours > rules.max_drive_per_shift + EPS:
            violations.append(
                Violation(
                    kind="11_hour_driving",
                    at=ev.start,
                    detail="Drove past the 11-hour driving limit without 10 consecutive hours off duty",
                    limit=rules.max_drive_per_shift,
                    actual=round(drive_today + hours, 4),
                )
            )

        if window_used(ev.end) > rules.max_window + EPS:
            violations.append(
                Violation(
                    kind="14_hour_window",
                    at=ev.start,
                    detail="Drove after the 14-hour driving window had closed",
                    limit=rules.max_window,
                    actual=round(window_used(ev.end), 4),
                )
            )

        if since_break + hours > rules.drive_before_break + EPS:
            violations.append(
                Violation(
                    kind="30_minute_break",
                    at=ev.start,
                    detail="Drove more than 8 cumulative hours without a 30-minute break",
                    limit=rules.drive_before_break,
                    actual=round(since_break + hours, 4),
                )
            )

        if cycle_used + hours > rules.cycle_limit + EPS:
            violations.append(
                Violation(
                    kind="70_hour_cycle",
                    at=ev.start,
                    detail="Drove past the 70-hour limit in an 8-day period",
                    limit=rules.cycle_limit,
                    actual=round(cycle_used + hours, 4),
                )
            )

        drive_today += hours
        since_break += hours
        cycle_used += hours

    return violations


def is_compliant(events, **kwargs) -> bool:
    return not validate_timeline(events, **kwargs)
