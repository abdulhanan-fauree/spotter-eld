"""Trip services.

    plan(data)              -> PlannedTrip     no database, no ORM
    persist(data, planned)  -> Trip            no HTTP, no planning
    plan_and_persist(data)  -> Trip            the two composed

Splitting them means the pipeline can be tested without migrations, and the write
path can be read one table at a time.
"""

from __future__ import annotations

from ..models import Trip
from .persistence import persist
from .planning import PlannedTrip, PlanningError, plan
from .timezones import DEFAULT_TZ, resolve_timezone

__all__ = [
    "DEFAULT_TZ",
    "PlannedTrip",
    "PlanningError",
    "plan",
    "plan_and_persist",
    "persist",
    "resolve_timezone",
]


def plan_and_persist(data: dict) -> Trip:
    """Plan a trip end to end and store it."""
    return persist(data, plan(data))
