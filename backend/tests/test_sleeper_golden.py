"""GOLDEN TEST 2 — FMCSA guide pp.8-9, the sleeper berth worked example.

The guide supplies two log grids (p.8), a "Qualifying Rest Breaks" table (p.8) and
a "Calculation Periods — no violation" table (p.9). Together they pin § 395.1(g).

RECONSTRUCTING THE TIMELINE
---------------------------
The guide prints the breaks and the period scores but not the full duty timeline;
that is only drawn in the figures. It is nonetheless *uniquely* determined by the
published numbers. Let a..e be the driving hours in the five non-rest blocks:

    a = Day 1 00:00-07:00 (7h available)      d = Day 2 00:00-05:00 (5h)
    b = Day 1 10:00-15:00 (5h)                e = Day 2 09:00-14:00 (5h)
    c = Day 1 22:00-24:00 (2h)

Constraints, from the figures' per-row totals and the p.9 period scores:

    Day 1 driving total    a + b + c = 11
    Day 2 driving total    d + e     = 9.5
    Period 1 driving       a + b     = 10      -> c = 1
    Period 2 driving       b + c + d = 11      -> b + d = 10
    Period 3 driving       c + d + e = 10.5    (consistent, no new information)

With b <= 5 and d <= 5, `b + d = 10` forces b = d = 5, hence a = 5 and e = 4.5.
The solution is unique:  a=5, b=5, c=1, d=5, e=4.5.

Cross-check against the figures' own row totals:
    Day 1  Off 3:00  SB 7:00  Driving 11:00  On Duty 3:00  = 24:00
    Day 2  Off 0:00  SB 14:00 Driving  9:30  On Duty 0:30  = 24:00
(the Day 2 figure prints SB as 13:59:00 because an ELD ends the day at 23:59:59)
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from apps.hos.sleeper import analyse, extract_rest_breaks, find_qualifying_pairs
from apps.hos.types import DutyStatus, Event

UTC = timezone.utc
D1 = datetime(2021, 4, 12, tzinfo=UTC)  # "Day 1" midnight


def at(day: int, hour: float) -> datetime:
    return D1 + timedelta(days=day - 1, hours=hour)


def ev(status: DutyStatus, day_a: int, h_a: float, day_b: int, h_b: float, note: str = "") -> Event:
    return Event(status=status, start=at(day_a, h_a), end=at(day_b, h_b), note=note)


# The reconstructed timeline, derived above.
TIMELINE: tuple[Event, ...] = (
    # ---- Day 1 ----
    ev(DutyStatus.D, 1, 0, 1, 3),  # a: 3h of the 5h driving
    ev(DutyStatus.ON, 1, 3, 1, 5),  # 2h on duty
    ev(DutyStatus.D, 1, 5, 1, 7),  # a: remaining 2h  -> a = 5
    ev(DutyStatus.OFF, 1, 7, 1, 10, "Break 1"),  # 3h off duty
    ev(DutyStatus.D, 1, 10, 1, 15),  # b = 5
    ev(DutyStatus.SB, 1, 15, 1, 22, "Break 2"),  # 7h sleeper berth
    ev(DutyStatus.D, 1, 22, 1, 23),  # c = 1
    ev(DutyStatus.ON, 1, 23, 1, 24),  # 1h on duty
    # ---- Day 2 ----
    ev(DutyStatus.D, 2, 0, 2, 5),  # d = 5
    ev(DutyStatus.SB, 2, 5, 2, 9, "Break 3"),  # 4h sleeper berth
    ev(DutyStatus.ON, 2, 9, 2, 9.5),  # 0.5h on duty
    ev(DutyStatus.D, 2, 9.5, 2, 14),  # e = 4.5
    ev(DutyStatus.SB, 2, 14, 2, 24, "Break 4"),  # 10h SB — full reset
)


def _totals(events, day: int) -> dict[DutyStatus, float]:
    lo, hi = at(day, 0), at(day, 24)
    out = {s: 0.0 for s in DutyStatus}
    for e in events:
        a, b = max(e.start, lo), min(e.end, hi)
        if b > a:
            out[e.status] += (b - a).total_seconds() / 3600.0
    return out


# --------------------------------------------------------------------------- #
# The timeline itself must match the figures before it can test anything else.
# --------------------------------------------------------------------------- #


def test_day1_row_totals_match_the_figure():
    t = _totals(TIMELINE, 1)
    assert t[DutyStatus.OFF] == pytest.approx(3.0)
    assert t[DutyStatus.SB] == pytest.approx(7.0)
    assert t[DutyStatus.D] == pytest.approx(11.0)
    assert t[DutyStatus.ON] == pytest.approx(3.0)
    assert sum(t.values()) == pytest.approx(24.0)


def test_day2_row_totals_match_the_figure():
    t = _totals(TIMELINE, 2)
    assert t[DutyStatus.OFF] == pytest.approx(0.0)
    assert t[DutyStatus.SB] == pytest.approx(14.0)
    assert t[DutyStatus.D] == pytest.approx(9.5)
    assert t[DutyStatus.ON] == pytest.approx(0.5)
    assert sum(t.values()) == pytest.approx(24.0)


# --------------------------------------------------------------------------- #
# "Qualifying Rest Breaks" table, guide p.8
# --------------------------------------------------------------------------- #


def test_qualifying_rest_breaks_table():
    breaks = extract_rest_breaks(TIMELINE)
    assert len(breaks) == 4

    assert (breaks[0].start, breaks[0].end) == (at(1, 7), at(1, 10))
    assert breaks[0].hours == pytest.approx(3.0)
    assert breaks[0].status is DutyStatus.OFF

    assert (breaks[1].start, breaks[1].end) == (at(1, 15), at(1, 22))
    assert breaks[1].hours == pytest.approx(7.0)
    assert breaks[1].status is DutyStatus.SB

    assert (breaks[2].start, breaks[2].end) == (at(2, 5), at(2, 9))
    assert breaks[2].hours == pytest.approx(4.0)

    assert (breaks[3].start, breaks[3].end) == (at(2, 14), at(2, 24))
    assert breaks[3].hours == pytest.approx(10.0)
    assert breaks[3].is_full_reset


def test_pairs_are_first_second_and_second_third():
    """"The first and second rest breaks can be paired; as can the second and
    third. The fourth qualifying break ... completely resets the clocks." (p.8)"""
    breaks = extract_rest_breaks(TIMELINE)
    assert find_qualifying_pairs(breaks) == [(0, 1), (1, 2)]


# --------------------------------------------------------------------------- #
# "Calculation Periods — no violation" table, guide p.9
# --------------------------------------------------------------------------- #

EXPECTED = [
    # start,        end,         excluded, driving, on-duty
    (at(1, 0), at(1, 15), 0, 10.0, 12.0),
    (at(1, 10), at(2, 5), 1, 11.0, 12.0),
    (at(1, 22), at(2, 14), 2, 10.5, 12.0),
]


def test_calculation_periods_table():
    _, periods = analyse(TIMELINE, clock_start=at(1, 0))
    assert len(periods) == 3

    for got, (start, end, excluded, driving, on_duty) in zip(periods, EXPECTED, strict=True):
        assert got.start == start
        assert got.end == end
        assert got.excluded_break == excluded
        assert got.driving_hours == pytest.approx(driving)
        assert got.on_duty_hours == pytest.approx(on_duty)


def test_no_violations():
    """The guide labels this example "no violation" in a green badge (p.9)."""
    _, periods = analyse(TIMELINE, clock_start=at(1, 0))
    assert all(p.compliant for p in periods)
    assert [p.violations for p in periods] == [(), (), ()]
