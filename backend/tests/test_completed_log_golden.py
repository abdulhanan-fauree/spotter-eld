"""GOLDEN TEST 1 — FMCSA guide pp.18-19, "A Completed Grid" / "A Completed Log".

John Doe, Richmond VA -> Newark NJ, 04/09/2021, 350 miles, Pro No. 101601.

The narrative on p.18 gives the timeline; the form on p.19 gives the totals. Those
totals were read off the *rendered page image*, not the PDF text layer -- the text
layer emits the Total Hours column in an order that does not match the grid rows,
which is an easy way to get them exactly backwards. The arithmetic below confirms
the reading independently.

    Off Duty       10.00   = 6.00 (00:00-06:00) + 1.00 (lunch) + 3.00 (21:00-24:00)
    Sleeper Berth   1.75   = 16:00-17:45
    Driving         7.75   = 1.50 + 2.50 + 2.00 + 0.50 + 1.25
    On Duty         4.50   = 1.50 + 0.50 + 0.50 + 2.00
                   -----
                   24.00

Note that Doe is on duty until 21:00 having started at 06:00 -- past the 14th hour.
The guide calls this out explicitly: "There is no problem with being on duty longer
than 14 hours as long as there is no CMV driving time after the 14th hour." This
log therefore also pins the "on-duty work is never blocked" invariant.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from apps.hos.splitter import split_days
from apps.hos.types import DutyStatus, Event

TZ = ZoneInfo("America/New_York")
DAY = datetime(2021, 4, 9, tzinfo=TZ)

D, ON, OFF, SB = DutyStatus.D, DutyStatus.ON, DutyStatus.OFF, DutyStatus.SB


def h(hours: float) -> datetime:
    return DAY + timedelta(hours=hours)


# p.18, in the order the narrative describes them. Driving distances are
# apportioned to sum to the 350 miles printed on the form.
JOHN_DOE: tuple[Event, ...] = (
    Event(OFF, h(0), h(6)),
    Event(ON, h(6), h(7.5), "Loading, dispatch, pre-trip inspection", location="Richmond, VA"),
    Event(D, h(7.5), h(9), miles=70),
    Event(ON, h(9), h(9.5), "Fueling", location="Fredericksburg, VA"),
    Event(D, h(9.5), h(12), miles=115),
    Event(OFF, h(12), h(13), "Lunch", location="Baltimore, MD"),
    Event(D, h(13), h(15), miles=95),
    Event(ON, h(15), h(15.5), "Delivery stop", location="Philadelphia, PA"),
    Event(D, h(15.5), h(16), miles=15),
    Event(SB, h(16), h(17.75), "Sleeper berth", location="Cherry Hill, NJ"),
    Event(D, h(17.75), h(19), miles=55),
    Event(ON, h(19), h(21), "Post-trip inspection and paperwork", location="Newark, NJ"),
    Event(OFF, h(21), h(24)),
)


@pytest.fixture
def sheet():
    sheets = split_days(JOHN_DOE, TZ)
    assert len(sheets) == 1, "one calendar day -> one log sheet"
    return sheets[0]


# --------------------------------------------------------------------------- #
# The Total Hours column, p.19
# --------------------------------------------------------------------------- #


def test_total_hours_column(sheet):
    assert sheet.totals[OFF] == pytest.approx(10.00)
    assert sheet.totals[SB] == pytest.approx(1.75)
    assert sheet.totals[D] == pytest.approx(7.75)
    assert sheet.totals[ON] == pytest.approx(4.50)


def test_totals_equal_24_hours(sheet):
    """"The total of the entries must equal 24 hours" -- guide p.16."""
    assert sheet.total_hours == pytest.approx(24.00)


def test_total_miles_driving_today(sheet):
    assert sheet.miles_driving_today == pytest.approx(350.0)


def test_date(sheet):
    assert (sheet.date.month, sheet.date.day, sheet.date.year) == (4, 9, 2021)


# --------------------------------------------------------------------------- #
# The grid, p.18
# --------------------------------------------------------------------------- #


def test_grid_is_continuous_and_covers_the_whole_day(sheet):
    """No gaps, no overlaps, midnight to midnight."""
    assert sheet.segments[0].start_minute == 0
    assert sheet.segments[-1].end_minute == 1440
    for a, b in zip(sheet.segments, sheet.segments[1:], strict=False):
        assert a.end_minute == b.start_minute


def test_duty_status_changes_match_the_narrative(sheet):
    expected = [
        (0, 360, OFF),  # midnight - 6:00 a.m.
        (360, 450, ON),  # 6:00 - 7:30   load, dispatch, pre-trip
        (450, 540, D),  # 7:30 - 9:00   drove 1.5 h
        (540, 570, ON),  # 9:00 - 9:30   fuel stop, 0.5 h
        (570, 720, D),  # 9:30 - noon   drove 2.5 h
        (720, 780, OFF),  # noon - 1:00 p.m.  lunch, logged off duty
        (780, 900, D),  # 1:00 - 3:00   drove 2 h
        (900, 930, ON),  # 3:00 - 3:30   delivery stop
        (930, 960, D),  # 3:30 - 4:00   drove 0.5 h
        (960, 1065, SB),  # 4:00 - 5:45   sleeper berth
        (1065, 1140, D),  # 5:45 - 7:00   drove 1.25 h
        (1140, 1260, ON),  # 7:00 - 9:00   post-trip, paperwork
        (1260, 1440, OFF),  # 9:00 p.m. - midnight
    ]
    assert [(s.start_minute, s.end_minute, s.status) for s in sheet.segments] == expected


# --------------------------------------------------------------------------- #
# The Remarks band, p.18
# --------------------------------------------------------------------------- #


def test_remarks_are_the_six_places_in_order(sheet):
    """p.18 lists exactly six entries, one per place -- not one per status change.

    There are twelve status changes but only six remarks: the two changes at the
    Fredericksburg fuel stop share a single entry, as do the two at Newark.
    """
    assert [r.location for r in sheet.remarks] == [
        "Richmond, VA",
        "Fredericksburg, VA",
        "Baltimore, MD",
        "Philadelphia, PA",
        "Cherry Hill, NJ",
        "Newark, NJ",
    ]


def test_remarks_land_at_the_right_times(sheet):
    assert [r.minute for r in sheet.remarks] == [360, 540, 720, 900, 960, 1140]


# --------------------------------------------------------------------------- #
# On duty past the 14th hour is legal, p.18
# --------------------------------------------------------------------------- #


def test_on_duty_past_hour_14_is_not_a_violation(sheet):
    """Doe starts at 06:00 and is on duty until 21:00 -- hour 15 of his window.

    "There is no problem with being on duty longer than 14 hours as long as there
    is no CMV driving time after the 14th hour." (p.18)
    """
    from apps.hos.validate import validate_timeline

    violations = validate_timeline(JOHN_DOE, cycle_used_start=0.0)
    assert violations == []

    last_drive = max(s.end_minute for s in sheet.segments if s.status is D)
    window_start, window_end = 360, 360 + 14 * 60
    assert last_drive <= window_end  # driving stopped inside the window
    assert max(s.end_minute for s in sheet.segments if s.status is ON) > window_end
