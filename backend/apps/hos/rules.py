"""Hours-of-Service constants.

Every value here traces to the FMCSA *Interstate Truck Driver's Guide to Hours of
Service* (April 2022) or to an assumption stated in the assessment brief. Nothing
is a magic number; if it is not cited it is a documented product decision.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Rules:
    # --- the three hard limits -------------------------------------------------
    max_drive_per_shift: float = 11.0
    """11-hour driving limit. § 395.3(a)(3), guide p.6."""

    max_window: float = 14.0
    """14-hour driving window, starts at the first on-duty minute. § 395.3(a)(2), p.6."""

    cycle_limit: float = 70.0
    """70 on-duty hours in any 8 consecutive days. § 395.3(b), p.10."""

    cycle_days: int = 8
    """The brief fixes us at 70/8 (the 60/7 alternative is out of scope)."""

    # --- breaks and resets -----------------------------------------------------
    drive_before_break: float = 8.0
    """30-min break required after 8 *cumulative* driving hours. § 395.3(a)(3)(ii), p.10."""

    break_len: float = 0.5
    """Length of that break. May be taken on duty, off duty or in the sleeper berth (p.10)."""

    reset_off: float = 10.0
    """10 consecutive hours off duty resets the 11- and 14-hour clocks. § 395.3(a)(1)."""

    restart: float = 34.0
    """34 consecutive hours off duty resets the 70-hour cycle to zero. § 395.3(c)."""

    # --- sleeper berth split, § 395.1(g), guide pp.7-9 -------------------------
    sb_long_min: float = 7.0
    """The long half of a split must be >= 7 consecutive hours *in the sleeper berth*."""

    sb_short_min: float = 2.0
    """The short half must be >= 2 hours, in the sleeper berth or otherwise off duty."""

    sb_pair_total: float = 10.0
    """The two paired periods must total at least 10 hours."""

    # --- brief assumptions -----------------------------------------------------
    fuel_interval_mi: float = 1000.0
    """"Fueling at least once every 1,000 miles" — assessment brief."""

    pickup_len: float = 1.0
    dropoff_len: float = 1.0
    """"1 hour for pickup and drop-off" — assessment brief."""

    # --- product decisions (documented, not from the reg) ----------------------
    fuel_len: float = 0.5
    """Fueling is on-duty time: "inspecting, servicing, or conditioning any truck,
    including fueling it" (guide p.5). 30 min is our estimate — and being >= 0.5h it
    also satisfies the 30-minute break, which the reg explicitly permits (p.10)."""

    pretrip_len: float = 0.25
    """Pre-trip inspection, on duty. Mirrors the FMCSA sample log (p.18)."""

    min_speed_mph: float = 40.0
    max_speed_mph: float = 65.0
    """Sanity clamp on the average speed implied by the routing API, so a bad
    duration estimate cannot produce a physically absurd plan."""

    day_start_minute: int = 0
    """Start of the 24-hour period, minutes past midnight in the home-terminal zone.
    Not necessarily midnight: "All drivers operating out of your home terminal must
    use the same starting time for the 24-hour period, as designated by your
    employer" (guide p.16; the grid's left edge is labelled "24-hour period starting
    time" on p.15)."""


DEFAULT_RULES = Rules()
