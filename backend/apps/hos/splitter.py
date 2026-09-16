"""Turn a flat duty timeline into one Driver's Daily Log sheet per 24-hour period.

The sheet boundary is the carrier-designated start of the 24-hour period in the
*home terminal* time zone — not necessarily midnight, and not the local time
wherever the truck happens to be:

    "You must use the time zone in effect at your home terminal. Even if you
     cross other time zones, record time as it is at your terminal. All drivers
     operating out of your home terminal must use the same starting time for the
     24-hour period, as designated by your employer."   -- guide p.16
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .recap import build_recap
from .rules import DEFAULT_RULES, Rules
from .types import DutyStatus, Event, LogSheet, Remark, Segment

MINUTES_PER_DAY = 1440


def _sheet_start(moment: datetime, rules: Rules) -> datetime:
    """The start of the 24-hour period containing `moment`."""
    base = moment.replace(hour=0, minute=0, second=0, microsecond=0)
    start = base + timedelta(minutes=rules.day_start_minute)
    if moment < start:
        start -= timedelta(days=1)
    return start


def _cycle_at(
    events: list[Event], moment: datetime, cycle_used_start: float, rules: Rules
) -> float:
    """On-duty hours in the rolling window as at `moment` -- Recap box C.

    This cannot be a running sum over daily totals, because a 34-hour restart sets
    it back to zero mid-trip: "After you have taken at least 34 consecutive hours
    off duty, you have the full 60 or 70 hours available again" (guide p.11). A
    naive accumulator happily reports 94 hours used, which is not a number that
    can exist.

    The restart takes effect when the 34 consecutive hours *complete*, so a
    restart still in progress at `moment` has not yet reset anything.
    """
    cycle = cycle_used_start
    for e in events:
        if e.start >= moment:
            break
        if e.status.is_rest and e.hours >= rules.restart and e.end <= moment:
            cycle = 0.0
        elif e.status.is_on_duty:
            hi = min(e.end, moment)
            if hi > e.start:
                cycle += (hi - e.start).total_seconds() / 3600.0
    return cycle


def split_days(
    events: tuple[Event, ...] | list[Event],
    tz: ZoneInfo,
    *,
    cycle_used_start: float = 0.0,
    prior_days: list[float] | None = None,
    rules: Rules = DEFAULT_RULES,
) -> list[LogSheet]:
    """Split `events` into log sheets.

    Any event crossing a sheet boundary is cut at the boundary and its halves
    assigned to the respective sheets, so every sheet's four totals sum to
    exactly 24.00 -- "The total of the entries must equal 24 hours" (guide p.16).
    """
    if not events:
        return []

    local = [
        Event(
            status=e.status,
            start=e.start.astimezone(tz),
            end=e.end.astimezone(tz),
            note=e.note,
            location=e.location,
            mile_marker=e.mile_marker,
            is_stop=e.is_stop,
            miles=e.miles,
            lat=e.lat,
            lng=e.lng,
        )
        for e in events
    ]

    first = _sheet_start(local[0].start, rules)
    last_end = max(e.end for e in local)

    sheets: list[LogSheet] = []
    day_index = 0

    running_prior = list(prior_days) if prior_days else None

    day_start = first
    while day_start < last_end:
        day_end = day_start + timedelta(days=1)

        segments: list[Segment] = []
        totals = {s: 0.0 for s in DutyStatus}
        miles = 0.0

        for e in local:
            lo, hi = max(e.start, day_start), min(e.end, day_end)
            if hi <= lo:
                continue
            start_min = round((lo - day_start).total_seconds() / 60)
            end_min = round((hi - day_start).total_seconds() / 60)
            if end_min <= start_min:
                continue

            segments.append(
                Segment(status=e.status, start_minute=start_min, end_minute=end_min, note=e.note)
            )
            hours = (end_min - start_min) / 60.0
            totals[e.status] += hours
            if e.status is DutyStatus.D and e.hours > 0:
                # apportion the leg's mileage across the part that falls in this day
                miles += e.miles * (hours / e.hours)

        if not segments:
            day_start = day_end
            continue

        # Fill every gap with Off Duty so the sheet spans the full 24 hours.
        # Before the trip opens and after it closes the driver is, by definition,
        # relieved of all duty -- and "The total of the entries must equal 24
        # hours" (guide p.16). Gaps are the classic way a generated log silently
        # fails to add up.
        segments.sort(key=lambda s: s.start_minute)
        filled: list[Segment] = []
        cursor = 0
        for s in segments:
            if s.start_minute > cursor:
                filled.append(Segment(status=DutyStatus.OFF, start_minute=cursor, end_minute=s.start_minute))
                totals[DutyStatus.OFF] += (s.start_minute - cursor) / 60.0
            filled.append(s)
            cursor = s.end_minute
        if cursor < MINUTES_PER_DAY:
            filled.append(Segment(status=DutyStatus.OFF, start_minute=cursor, end_minute=MINUTES_PER_DAY))
            totals[DutyStatus.OFF] += (MINUTES_PER_DAY - cursor) / 60.0
        segments = filled

        # Remarks: one per change of duty status that happens at a named place,
        # collapsing consecutive changes at the same place into a single entry.
        # "Each time you change your duty status, you must write down the name of
        # the city, town, or village, and State abbreviation" (guide p.17).
        remarks: list[Remark] = []
        for e in local:
            if not e.location or not (day_start <= e.start < day_end):
                continue
            minute = round((e.start - day_start).total_seconds() / 60)
            if remarks and remarks[-1].location == e.location:
                continue
            remarks.append(Remark(minute=minute, location=e.location, note=e.note))

        on_duty_today = totals[DutyStatus.D] + totals[DutyStatus.ON]
        recap = build_recap(
            on_duty_today=on_duty_today,
            cycle_used_end_of_day=_cycle_at(local, day_end, cycle_used_start, rules),
            prior_days=running_prior,
            rules=rules,
        )
        if running_prior is not None:
            running_prior = (running_prior + [on_duty_today])[-rules.cycle_days :]

        day_index += 1
        sheets.append(
            LogSheet(
                date=day_start.date(),
                day_index=day_index,
                segments=tuple(segments),
                remarks=tuple(remarks),
                totals={k: round(v, 4) for k, v in totals.items()},
                miles_driving_today=round(miles, 1),
                recap=recap,
                is_partial=day_end > last_end,
            )
        )
        day_start = day_end

    return sheets


def last_duty_change_minute(sheet: LogSheet) -> int:
    """Minute of the final real change of duty status on this sheet.

    On the last sheet of a trip everything after this point is trailing off-duty
    padding. The renderer can grey it, because a driver's log is only required to
    be "current to your last change of duty status" (guide p.16) -- but the totals
    still have to reach 24, which is why the padding exists at all.
    """
    real = [s for s in sheet.segments if s.status is not DutyStatus.OFF]
    return real[-1].end_minute if real else 0
