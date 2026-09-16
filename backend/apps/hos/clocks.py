"""The four HOS counters and their reset semantics.

Kept separate from the planner so the reset rules can be tested in isolation and
so `validate.py` can re-derive them independently.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from .rules import DEFAULT_RULES, Rules
from .types import DutyStatus


@dataclass(frozen=True)
class Clocks:
    """Immutable snapshot of a driver's four running limits.

    - `drive_today`   counts toward the 11-hour driving limit
    - `window_used`   counts toward the 14-hour driving window
    - `since_break`   driving hours since the last >=30-min non-driving period
    - `cycle_used`    on-duty hours in the rolling 8-day window
    """

    drive_today: float = 0.0
    window_used: float = 0.0
    since_break: float = 0.0
    cycle_used: float = 0.0
    rules: Rules = DEFAULT_RULES

    # -- capacity ----------------------------------------------------------- #

    def drivable_hours(self) -> float:
        """Hours the driver may legally drive *right now*, before any rest."""
        r = self.rules
        return max(
            0.0,
            min(
                r.max_drive_per_shift - self.drive_today,
                r.max_window - self.window_used,
                r.drive_before_break - self.since_break,
                r.cycle_limit - self.cycle_used,
            ),
        )

    def needs_break_only(self) -> bool:
        """True when the 30-minute break alone would restore driving capacity.

        i.e. the 8-hour driving counter is the binding constraint and the 11/14/70
        clocks still have room once it is cleared.
        """
        r = self.rules
        if self.since_break < r.drive_before_break:
            return False
        return (
            self.drive_today < r.max_drive_per_shift
            and self.window_used + r.break_len < r.max_window
            and self.cycle_used < r.cycle_limit
        )

    def cycle_exhausted(self) -> bool:
        return self.cycle_used >= self.rules.cycle_limit

    # -- advancing ---------------------------------------------------------- #

    def after(self, status: DutyStatus, hours: float) -> Clocks:
        """Return new clocks after `hours` spent at `status`.

        Four invariants, each a direct reading of the guide:

        1. Any non-driving period of >= `break_len` clears the 8-hour driving
           counter. The break "may be taken either on duty, off duty, or in the
           sleeper berth" (p.10) — so a fuel stop or a 1-hour pickup already
           satisfies it.
        2. Driving and on-duty-not-driving both accrue to the 70-hour cycle.
        3. >= 10 consecutive rest hours reset the 11- and 14-hour clocks;
           >= 34 additionally zeroes the cycle.
        4. On-duty *non-driving* work is never blocked — only driving is. This
           method therefore never refuses to advance. Guide p.9: "you are allowed
           to do non-driving work after the 14-hour limit is reached, just no more
           driving"; p.10: "Violations ... can only occur if you *drive* past
           these limits."
        """
        r = self.rules

        # (3) long rest resets
        if status.is_rest and hours >= r.restart:
            return replace(self, drive_today=0.0, window_used=0.0, since_break=0.0, cycle_used=0.0)
        if status.is_rest and hours >= r.reset_off:
            return replace(self, drive_today=0.0, window_used=0.0, since_break=0.0)

        drive_today = self.drive_today
        window_used = self.window_used
        since_break = self.since_break
        cycle_used = self.cycle_used

        if status is DutyStatus.D:
            drive_today += hours
            since_break += hours
        elif hours >= r.break_len:
            since_break = 0.0  # (1)

        if status.is_on_duty:
            cycle_used += hours  # (2)

        # Everything inside a shift consumes the 14-hour window, including the
        # 30-minute break: "The 30-minute break does not increase the maximum
        # driving time during the work shift" (p.10). Rest short of 10 hours is
        # still inside the window.
        window_used += hours

        return replace(
            self,
            drive_today=drive_today,
            window_used=window_used,
            since_break=since_break,
            cycle_used=cycle_used,
        )

    def restart_shift(self) -> Clocks:
        """Explicit 11/14 reset, for use after a full 10-hour reset."""
        return replace(self, drive_today=0.0, window_used=0.0, since_break=0.0)

    def after_paired_rest(self, hours: float) -> Clocks:
        """Rest that is one half of a § 395.1(g) pair.

        "When paired, neither qualifying period counts against the 14-hour
        driving window" (guide p.7). So unlike `after()`, the hours do not
        advance `window_used` — that exclusion is the whole point of the split.
        The rest still clears the 30-minute break counter, and still accrues
        nothing to the cycle because rest is not on-duty time.
        """
        return replace(self, since_break=0.0)

    def rebased(self, *, drive_today: float, window_used: float) -> Clocks:
        """Recompute the shift clocks against a new calculation period.

        Used when a pairing completes: the accounting window moves to start at
        the end of the pair's *first* rest, so driving and on-duty time from
        before that point drop out of the 11- and 14-hour sums.
        """
        return replace(
            self,
            drive_today=max(0.0, drive_today),
            window_used=max(0.0, window_used),
            since_break=0.0,
        )
