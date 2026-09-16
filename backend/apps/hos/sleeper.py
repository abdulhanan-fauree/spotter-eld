"""Sleeper berth provision, § 395.1(g). Guide pp.7-9.

Three ways to take the required off-duty time:

1. 10 consecutive hours in the sleeper berth -> full reset of the 11- and 14-hour
   clocks.
2. >= 7 consecutive hours in the sleeper berth combined with up to 3 hours off duty
   or riding as a passenger, totalling >= 10 consecutive hours.
3. **The split.** Two *non-consecutive* periods: one of >= 7 consecutive hours in
   the sleeper berth, paired with one of >= 2 hours in the sleeper berth or
   otherwise off duty, together totalling >= 10 hours. Order does not matter, and
   **when paired, neither period counts against the 14-hour driving window.**

The accounting rules for form 3 (guide p.9):

    "Starts: at the end of the first rest break paired.
     Ends:   at the start of the second rest break paired."

The paired break is excluded from the 11- and 14-hour accounting; all time on
either side of it still counts. After a valid pairing the calculation point
advances to the end of the new first break.
"""

from __future__ import annotations

from datetime import datetime

from .rules import DEFAULT_RULES, Rules
from .types import CalculationPeriod, DutyStatus, Event, RestBreak


def extract_rest_breaks(events: list[Event] | tuple[Event, ...], rules: Rules = DEFAULT_RULES) -> list[RestBreak]:
    """Collapse consecutive rest events and keep those long enough to qualify.

    Adjacent OFF/SB runs are merged before testing, because a 7-hour sleeper
    period that happens to be logged as two touching events is still 7
    consecutive hours in the berth.
    """
    merged: list[RestBreak] = []
    for ev in events:
        if not ev.status.is_rest:
            continue
        if merged and merged[-1].end == ev.start and merged[-1].status is ev.status:
            prev = merged[-1]
            merged[-1] = RestBreak(start=prev.start, end=ev.end, status=prev.status)
        else:
            merged.append(RestBreak(start=ev.start, end=ev.end, status=ev.status))

    return [b for b in merged if b.qualifies]


def find_qualifying_pairs(breaks: list[RestBreak], rules: Rules = DEFAULT_RULES) -> list[tuple[int, int]]:
    """Indices of adjacent break pairs that together satisfy § 395.1(g).

    A pair qualifies when exactly one member is a >= 7h sleeper-berth period, the
    other is >= 2h of rest, and the two total >= 10h. Pairing is between
    *consecutive* qualifying breaks — the guide's example pairs (1,2) and (2,3),
    so a single break may participate in two pairs.
    """
    pairs: list[tuple[int, int]] = []
    for i in range(len(breaks) - 1):
        a, b = breaks[i], breaks[i + 1]
        if a.hours + b.hours < rules.sb_pair_total:
            continue
        # exactly one long sleeper-berth half, the other any qualifying rest
        if a.qualifies_long and b.qualifies_short:
            pairs.append((i, i + 1))
        elif b.qualifies_long and a.qualifies_short:
            pairs.append((i, i + 1))
    return pairs


def calculation_periods(
    breaks: list[RestBreak],
    clock_start: datetime,
    rules: Rules = DEFAULT_RULES,
) -> list[CalculationPeriod]:
    """Build the § 395.1(g) accounting windows for a set of qualifying breaks.

    The first period runs from `clock_start` (the moment the driver came on duty
    after a full 10-hour reset) to the start of the *second* break of the first
    pair, excluding the first break. Each subsequent period starts at the end of
    the pair's first break and ends at the start of its second.
    """
    pairs = find_qualifying_pairs(breaks, rules)
    paired: set[int] = {k for pair in pairs for k in pair}

    periods: list[CalculationPeriod] = []
    for n, k in enumerate(sorted(paired), start=1):
        # Each qualifying break is excluded in turn; the window around it runs
        # from the end of the previous break to the start of the next one.
        start = clock_start if k == 0 else breaks[k - 1].end
        end = breaks[k + 1].start if k + 1 < len(breaks) else breaks[k].end
        periods.append(
            CalculationPeriod(index=n, start=start, end=end, excluded_break=k)
        )

    return periods


def score_period(
    period: CalculationPeriod,
    events: list[Event] | tuple[Event, ...],
    breaks: list[RestBreak],
    rules: Rules = DEFAULT_RULES,
) -> CalculationPeriod:
    """Total the driving and on-duty hours inside a period, excluding its paired break."""
    excluded = breaks[period.excluded_break]
    driving = 0.0
    on_duty = 0.0

    for ev in events:
        lo = max(ev.start, period.start)
        hi = min(ev.end, period.end)
        if hi <= lo:
            continue
        hours = (hi - lo).total_seconds() / 3600.0

        # subtract any part of this event that falls inside the excluded break
        x_lo = max(lo, excluded.start)
        x_hi = min(hi, excluded.end)
        if x_hi > x_lo:
            hours -= (x_hi - x_lo).total_seconds() / 3600.0
        if hours <= 0:
            continue

        if ev.status is DutyStatus.D:
            driving += hours
        if ev.status.is_on_duty:
            on_duty += hours

    problems: list[str] = []
    if driving > rules.max_drive_per_shift + 1e-9:
        problems.append(f"11-hour driving limit exceeded ({driving:.2f} h)")
    if on_duty > rules.max_window + 1e-9:
        problems.append(f"14-hour driving window exceeded ({on_duty:.2f} h)")

    return CalculationPeriod(
        index=period.index,
        start=period.start,
        end=period.end,
        excluded_break=period.excluded_break,
        driving_hours=round(driving, 4),
        on_duty_hours=round(on_duty, 4),
        violations=tuple(problems),
    )


def analyse(
    events: list[Event] | tuple[Event, ...],
    clock_start: datetime,
    rules: Rules = DEFAULT_RULES,
) -> tuple[list[RestBreak], list[CalculationPeriod]]:
    """Full § 395.1(g) pass: breaks -> pairs -> periods -> scores."""
    breaks = extract_rest_breaks(events, rules)
    periods = [score_period(p, events, breaks, rules) for p in calculation_periods(breaks, clock_start, rules)]
    return breaks, periods
