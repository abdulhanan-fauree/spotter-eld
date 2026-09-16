"""Value types for the HOS engine.

Pure dataclasses. No Django, no I/O, no framework — this module and its siblings
are the graded core and must stay testable in milliseconds.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum


class DutyStatus(StrEnum):
    """The four lines of the § 395.8 graph grid, in row order (guide p.16)."""

    OFF = "OFF"  # row 1 — Off Duty
    SB = "SB"  # row 2 — Sleeper Berth
    D = "D"  # row 3 — Driving
    ON = "ON"  # row 4 — On Duty (not driving)

    @property
    def row(self) -> int:
        return {"OFF": 0, "SB": 1, "D": 2, "ON": 3}[self.value]

    @property
    def label(self) -> str:
        return {
            "OFF": "Off Duty",
            "SB": "Sleeper Berth",
            "D": "Driving",
            "ON": "On Duty (not driving)",
        }[self.value]

    @property
    def is_on_duty(self) -> bool:
        """Counts toward the 60/70-hour cycle. § 395.2 definition of on-duty time."""
        return self in (DutyStatus.D, DutyStatus.ON)

    @property
    def is_rest(self) -> bool:
        """Qualifies as time off for reset purposes."""
        return self in (DutyStatus.OFF, DutyStatus.SB)


# --------------------------------------------------------------------------- #
# Inputs
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class LegInput:
    """One routed leg: current -> pickup, or pickup -> dropoff."""

    kind: str  # "to_pickup" | "to_dropoff"
    distance_mi: float
    duration_hr: float  # as reported by the routing API
    dest_label: str  # "Oklahoma City, OK"
    dest_action: DutyStatus = DutyStatus.ON
    dest_duration_hr: float | None = None  # None -> rules.pickup_len / dropoff_len


@dataclass(frozen=True)
class PlanInput:
    start: datetime  # tz-aware, home-terminal zone
    cycle_used_hr: float  # Recap box C: on duty last 8 days including today
    legs: tuple[LegInput, ...]
    allow_sleeper_split: bool = False  # § 395.1(g) two-period split


# --------------------------------------------------------------------------- #
# Outputs
# --------------------------------------------------------------------------- #


class StopKind(StrEnum):
    """What a stop *is*, independent of how it is worded on screen.

    Persistence, map pin colours and the itinerary all branch on this. Matching
    on `note` instead would couple the database to display copy.
    """

    PRE_TRIP = "pre_trip"
    PICKUP = "pickup"
    DROPOFF = "dropoff"
    FUEL = "fuel"
    BREAK_30 = "break_30"
    REST_10 = "rest_10"
    RESTART_34 = "restart_34"
    SPLIT_SB = "split_sb"  # >= 7h sleeper berth, the long half of a § 395.1(g) pair
    SPLIT_OFF = "split_off"  # >= 2h rest, the short half


@dataclass(frozen=True)
class Event:
    """One continuous period at a single duty status."""

    status: DutyStatus
    start: datetime
    end: datetime
    note: str = ""  # "Fueling", "10-hour rest", ... — display copy
    kind: str = ""  # StopKind, for stops — the stable identifier
    location: str = ""  # "Fredericksburg, VA" — drives the Remarks column
    mile_marker: float | None = None  # cumulative route miles at `start`
    is_stop: bool = False  # renders as a map pin
    miles: float = 0.0  # miles covered by this event (driving only)
    lat: float | None = None
    lng: float | None = None

    @property
    def hours(self) -> float:
        return (self.end - self.start).total_seconds() / 3600.0


@dataclass(frozen=True)
class Plan:
    events: tuple[Event, ...]
    total_miles: float
    drive_hours: float
    on_duty_hours: float
    elapsed_hours: float
    arrival: datetime
    cycle_used_start: float
    cycle_used_end: float


@dataclass(frozen=True)
class Segment:
    """A duty period clipped to one log sheet, in minutes past the sheet's start."""

    status: DutyStatus
    start_minute: int
    end_minute: int
    note: str = ""

    @property
    def hours(self) -> float:
        return (self.end_minute - self.start_minute) / 60.0


@dataclass(frozen=True)
class Remark:
    """A duty-status change annotated with its location. Guide p.17."""

    minute: int
    location: str
    note: str = ""


@dataclass(frozen=True)
class Recap:
    """The Recap band at the foot of the log sheet.

    Semantics derived from § 395.3(b) — the form prints B's formula, which pins A:
    tomorrow's window is [last 7 days including today] + tomorrow, so what remains
    for tomorrow is 70 - (last 7 days). C is the *current* 8-day window, i.e. the
    number compared against 70 — which is exactly the app's `cycle_used` input.
    """

    on_duty_today: float  # total of grid lines 3 & 4
    total_last_7_days: float  # box A
    available_tomorrow: float  # box B = 70 - A
    total_last_8_days: float  # box C = current cycle usage


@dataclass(frozen=True)
class LogSheet:
    date: date
    day_index: int
    segments: tuple[Segment, ...]
    remarks: tuple[Remark, ...]
    totals: dict[DutyStatus, float]
    miles_driving_today: float
    recap: Recap
    is_partial: bool = False  # final, still-in-progress day

    @property
    def total_hours(self) -> float:
        return sum(self.totals.values())


@dataclass(frozen=True)
class Violation:
    kind: str
    at: datetime
    detail: str
    limit: float
    actual: float


# --------------------------------------------------------------------------- #
# Sleeper berth, § 395.1(g)
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class RestBreak:
    """A candidate qualifying rest break for the split-sleeper calculation."""

    start: datetime
    end: datetime
    status: DutyStatus  # SB, or OFF for the short half

    @property
    def hours(self) -> float:
        return (self.end - self.start).total_seconds() / 3600.0

    @property
    def is_full_reset(self) -> bool:
        """>= 10 consecutive rest hours: a complete reset under § 395.3(a)(1).

        Such a break needs no pairing and must not be consumed as half of one.
        The guide is explicit about its own example: "The fourth qualifying break
        ... is the 10-consecutive hour break in the sleeper berth at the end of
        Day 2, which completely resets the 11- and 14-hour clocks" (p.8) — it is
        listed among the qualifying breaks but is *not* paired.
        """
        return self.hours >= 10.0

    @property
    def qualifies_long(self) -> bool:
        """>= 7 consecutive hours *in the sleeper berth*."""
        return self.status is DutyStatus.SB and self.hours >= 7.0 and not self.is_full_reset

    @property
    def qualifies_short(self) -> bool:
        """>= 2 hours in the sleeper berth or otherwise off duty."""
        return self.status.is_rest and self.hours >= 2.0 and not self.is_full_reset

    @property
    def qualifies(self) -> bool:
        """Is this a "qualifying rest break" at all?

        A full reset counts as one — the guide's own table lists the 10-hour
        sleeper period as Break 4 — it simply cannot be *paired*. Keeping it in
        the list matters: it terminates the preceding calculation period.
        """
        return self.qualifies_long or self.qualifies_short or self.is_full_reset


@dataclass(frozen=True)
class CalculationPeriod:
    """One § 395.1(g) accounting window.

    "Starts: at the end of the first rest break paired. Ends: at the start of the
    second rest break paired." (guide p.9)
    """

    index: int
    start: datetime
    end: datetime
    excluded_break: int  # index into the break list
    driving_hours: float = 0.0
    on_duty_hours: float = 0.0
    violations: tuple[str, ...] = field(default_factory=tuple)

    @property
    def compliant(self) -> bool:
        return not self.violations
