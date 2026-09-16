"""The caching facade.

Nominatim allows one request per second and a five-day trip needs ~20
reverse-geocodes for the Remarks column alone, so "did we actually avoid the
second call?" is a correctness question, not a performance one.

These tests count upstream calls directly rather than timing anything.
"""

from __future__ import annotations

import pytest
from django.test import override_settings

from apps.geo import service
from apps.geo.providers import Place, Route, Step
from apps.geo.models import CachedResponse

pytestmark = pytest.mark.django_db

AMARILLO = Place(name="Amarillo, Texas", lat=35.222, lng=-101.831, city_state="Amarillo, TX")

ROUTE = Route(
    distance_mi=200.0,
    duration_hr=3.6,
    geometry=[(32.7767, -96.797), (35.4676, -97.5164)],
    steps=[
        Step(instruction="Head north", distance_mi=100.0, duration_hr=1.8, mile_marker=0.0),
        Step(instruction="Arrive", distance_mi=100.0, duration_hr=1.8, mile_marker=100.0),
    ],
    provider="osrm/driving",
)


class Counter:
    """Stands in for a client function and records how often it was called."""

    def __init__(self, result):
        self.result = result
        self.calls = 0

    def __call__(self, *args, **kwargs):
        self.calls += 1
        return self.result


# --------------------------------------------------------------------------- #
# Geocoding
# --------------------------------------------------------------------------- #


def test_geocode_hits_upstream_once_then_serves_from_cache(monkeypatch):
    spy = Counter(AMARILLO)
    monkeypatch.setattr(service.providers, "geocode", spy)

    first = service.geocode("Amarillo TX")
    second = service.geocode("Amarillo TX")

    assert spy.calls == 1
    assert first == second == AMARILLO


@pytest.mark.parametrize("variant", ["amarillo tx", "  Amarillo   TX  ", "AMARILLO TX"])
def test_geocode_cache_key_is_normalised(monkeypatch, variant):
    """Case and whitespace must not each get their own Nominatim call."""
    spy = Counter(AMARILLO)
    monkeypatch.setattr(service.providers, "geocode", spy)

    service.geocode("Amarillo TX")
    service.geocode(variant)

    assert spy.calls == 1


def test_geocode_cache_records_a_hit(monkeypatch):
    monkeypatch.setattr(service.providers, "geocode", Counter(AMARILLO))
    service.geocode("Amarillo TX")
    service.geocode("Amarillo TX")
    row = CachedResponse.objects.get(kind=CachedResponse.KIND_GEOCODE)
    assert row.hits == 1


# --------------------------------------------------------------------------- #
# Reverse geocoding
# --------------------------------------------------------------------------- #


def test_reverse_is_cached(monkeypatch):
    spy = Counter("Amarillo, TX")
    monkeypatch.setattr(service.providers, "reverse", spy)

    assert service.reverse(35.2219, -101.8312) == "Amarillo, TX"
    assert service.reverse(35.2219, -101.8312) == "Amarillo, TX"
    assert spy.calls == 1


def test_nearby_points_share_one_reverse_lookup(monkeypatch):
    """Shape points a few metres apart on the same interstate are the same place.

    Keys are rounded to ~100 m, so a dense polyline does not become a hundred
    separate Nominatim requests.
    """
    spy = Counter("Amarillo, TX")
    monkeypatch.setattr(service.providers, "reverse", spy)

    service.reverse(35.22190, -101.83120)
    service.reverse(35.22194, -101.83124)
    service.reverse(35.22188, -101.83118)

    assert spy.calls == 1


def test_distant_points_do_not_share_a_lookup(monkeypatch):
    spy = Counter("Somewhere, TX")
    monkeypatch.setattr(service.providers, "reverse", spy)

    service.reverse(35.222, -101.831)
    service.reverse(35.470, -97.516)

    assert spy.calls == 2


def test_failed_reverse_lookups_are_not_cached(monkeypatch):
    """An empty result is usually a blip; caching it would poison the Remarks
    column for the lifetime of the cache."""
    spy = Counter("")
    monkeypatch.setattr(service.providers, "reverse", spy)

    service.reverse(35.222, -101.831)
    service.reverse(35.222, -101.831)

    assert spy.calls == 2
    assert not CachedResponse.objects.filter(kind=CachedResponse.KIND_REVERSE).exists()


# --------------------------------------------------------------------------- #
# Autocomplete
# --------------------------------------------------------------------------- #


def test_empty_suggestions_are_not_cached(monkeypatch):
    spy = Counter([])
    monkeypatch.setattr(service.providers, "suggest", spy)

    service.suggest("dallas")
    service.suggest("dallas")

    assert spy.calls == 2


def test_suggestions_are_cached_when_non_empty(monkeypatch):
    spy = Counter([AMARILLO])
    monkeypatch.setattr(service.providers, "suggest", spy)

    assert service.suggest("amar") == [AMARILLO]
    assert service.suggest("amar") == [AMARILLO]
    assert spy.calls == 1


# --------------------------------------------------------------------------- #
# Routing
# --------------------------------------------------------------------------- #


def test_route_is_cached(monkeypatch):
    spy = Counter(ROUTE)
    monkeypatch.setattr(service.providers, "route", spy)

    points = [(32.7767, -96.797), (35.4676, -97.5164)]
    a = service.route(points)
    b = service.route(points)

    assert spy.calls == 1
    assert a.distance_mi == b.distance_mi
    assert a.geometry == b.geometry
    assert a.provider == b.provider


def test_cached_route_rebases_mile_markers_for_a_new_offset(monkeypatch):
    """Mile markers are trip-absolute, so the same leg used at a different offset
    must not need a fresh upstream call -- just a shift."""
    spy = Counter(ROUTE)
    monkeypatch.setattr(service.providers, "route", spy)

    points = [(32.7767, -96.797), (35.4676, -97.5164)]
    service.route(points, mile_offset=0.0)
    shifted = service.route(points, mile_offset=380.0)

    assert spy.calls == 1
    assert [s.mile_marker for s in shifted.steps] == [
        pytest.approx(380.0),
        pytest.approx(480.0),
    ]


def test_route_geometry_survives_the_json_round_trip(monkeypatch):
    """JSON has no tuples; the cache must hand back (lat, lng) pairs regardless."""
    monkeypatch.setattr(service.providers, "route", Counter(ROUTE))
    points = [(32.7767, -96.797), (35.4676, -97.5164)]
    service.route(points)
    cached = service.route(points)

    assert all(isinstance(p, tuple) and len(p) == 2 for p in cached.geometry)
    assert cached.geometry == ROUTE.geometry


@override_settings(ORS_API_KEY="")
def test_changing_the_routing_provider_busts_the_cache(monkeypatch):
    """A car route must never be served in place of a truck route."""
    spy = Counter(ROUTE)
    monkeypatch.setattr(service.providers, "route", spy)
    points = [(32.7767, -96.797), (35.4676, -97.5164)]

    service.route(points)
    with override_settings(ORS_API_KEY="now-we-have-a-key"):
        service.route(points)

    assert spy.calls == 2


# --------------------------------------------------------------------------- #
# Annotating the planner's stops
# --------------------------------------------------------------------------- #


def test_annotate_stops_fills_in_locations(monkeypatch):
    """Regression: without this the Remarks column comes out empty.

    The planner only knows the names of the pickup and the dropoff. Every fuel
    stop, break and rest has a blank location until it is reverse-geocoded, and
    `Event` is frozen so the events must be rebuilt, not mutated.
    """
    from datetime import datetime, timedelta, timezone

    from apps.hos.types import DutyStatus, Event

    monkeypatch.setattr(service.providers, "reverse", Counter("Amarillo, TX"))

    t0 = datetime(2026, 8, 3, tzinfo=timezone.utc)
    events = (
        Event(DutyStatus.D, t0, t0 + timedelta(hours=8), miles=440, mile_marker=0.0),
        Event(DutyStatus.ON, t0 + timedelta(hours=8), t0 + timedelta(hours=8, minutes=30),
              note="Fueling", mile_marker=440.0, is_stop=True),
        Event(DutyStatus.ON, t0 + timedelta(hours=9), t0 + timedelta(hours=10),
              note="Dropoff", location="Newark, NJ", mile_marker=500.0, is_stop=True),
    )
    geom = [(35.0, -101.0), (36.0, -100.0), (37.0, -99.0)]

    out = service.annotate_stops(events, geom, 500.0)

    assert out[0].location == ""            # driving events get no remark
    assert out[1].location == "Amarillo, TX"  # looked up
    assert out[1].lat is not None and out[1].lng is not None
    assert out[2].location == "Newark, NJ"  # already known, not overwritten


def test_annotate_stops_is_a_noop_without_geometry():
    from datetime import datetime, timedelta, timezone

    from apps.hos.types import DutyStatus, Event

    t0 = datetime(2026, 8, 3, tzinfo=timezone.utc)
    events = (Event(DutyStatus.ON, t0, t0 + timedelta(hours=1), mile_marker=0.0, is_stop=True),)
    assert service.annotate_stops(events, [], 0.0) == events


# --------------------------------------------------------------------------- #
# Cache failures must never break a lookup
# --------------------------------------------------------------------------- #


def test_geocode_survives_a_cache_write_failure(monkeypatch):
    """Regression: three location fields autocomplete concurrently, each writing
    to the cache. Under SQLite that raised "database is locked" and 500'd a
    request whose upstream call had already succeeded."""
    from django.db import DatabaseError

    monkeypatch.setattr(service.providers, "geocode", Counter(AMARILLO))
    monkeypatch.setattr(
        service.CachedResponse.objects,
        "update_or_create",
        lambda **kw: (_ for _ in ()).throw(DatabaseError("database is locked")),
    )
    assert service.geocode("Amarillo TX") == AMARILLO


def test_geocode_survives_a_cache_read_failure(monkeypatch):
    from django.db import DatabaseError

    monkeypatch.setattr(service.providers, "geocode", Counter(AMARILLO))
    monkeypatch.setattr(
        service.CachedResponse.objects,
        "filter",
        lambda **kw: (_ for _ in ()).throw(DatabaseError("database is locked")),
    )
    assert service.geocode("Amarillo TX") == AMARILLO


def test_suggest_survives_a_cache_failure(monkeypatch):
    from django.db import DatabaseError

    monkeypatch.setattr(service.providers, "suggest", Counter([AMARILLO]))
    monkeypatch.setattr(
        service.CachedResponse.objects,
        "update_or_create",
        lambda **kw: (_ for _ in ()).throw(DatabaseError("locked")),
    )
    assert service.suggest("amar") == [AMARILLO]
