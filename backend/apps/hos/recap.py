"""The Recap band at the foot of the Driver's Daily Log.

The supplied blank form prints, for the 70-hour/8-day column:

    On duty hours today, total lines 3 & 4
    A.  Total hours on duty last 7 days including today
    B.  Total hours available tomorrow, 70 hr. minus A*
    C.  Total hours on duty last 8 days including today
    *If you took 34 consecutive hours off duty you have 60/70 hours available

Why A is 7 days and C is 8, which is the part that reads backwards at first: the
form itself prints B's formula, and that pins A. Tomorrow the rolling window
becomes [the last 7 days including today] + tomorrow, so what is left to spend
tomorrow is 70 - (last 7 days including today). C is the *current* 8-day window --
the number you compare against 70 -- which is exactly the app's `cycle_used`
input.

MODELLING NOTE
--------------
The brief gives us `current_cycle_used` as a single scalar, but § 395.3(b) is a
*rolling* window: the oldest day's hours drop off each day (the guide walks a
67 -> 73 -> 63 example on pp.10-11). One number cannot tell us *when* those prior
hours were worked, so drop-off is not derivable from the given inputs.

Default behaviour is therefore no roll-off: hours accumulate and never age out.
That is deliberately conservative -- it can under-report available hours but never
over-reports them, so a plan built on it is never optimistic about legality.

Pass `prior_days` (up to 8 daily on-duty totals, oldest first) to model the
rolling window properly.
"""

from __future__ import annotations

from .rules import DEFAULT_RULES, Rules
from .types import Recap


def build_recap(
    *,
    on_duty_today: float,
    cycle_used_end_of_day: float,
    prior_days: list[float] | None = None,
    rules: Rules = DEFAULT_RULES,
) -> Recap:
    """Compute boxes A, B and C for one log sheet.

    `cycle_used_end_of_day` is box C: on-duty hours in the current 8-day window,
    including today.
    """
    box_c = cycle_used_end_of_day

    if prior_days is None:
        # No roll-off information available -- see the modelling note above.
        box_a = box_c
    else:
        # The full window is `prior_days` (oldest first) plus today. Box A drops
        # the oldest of the eight.
        window = (list(prior_days) + [on_duty_today])[-rules.cycle_days :]
        box_a = sum(window[1:]) if len(window) == rules.cycle_days else sum(window)

    box_b = max(0.0, rules.cycle_limit - box_a)

    return Recap(
        on_duty_today=round(on_duty_today, 4),
        total_last_7_days=round(box_a, 4),
        available_tomorrow=round(box_b, 4),
        total_last_8_days=round(box_c, 4),
    )
