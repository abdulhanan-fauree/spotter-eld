"""API surface, with the geo layer stubbed.

Geocoding and routing are exercised for real in `test_geo_clients.py` against a
mocked transport; here they are replaced wholesale so these tests stay fast,
offline, and about the API's own behaviour.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.geo.providers import Place, Route, Step

pytestmark = pytest.mark.django_db

DALLAS = Place(name="Dallas, Texas", lat=32.7767, lng=-96.7970, city_state="Dallas, TX")
OKC = Place(name="Oklahoma City", lat=35.4676, lng=-97.5164, city_state="Oklahoma City, OK")
NEWARK = Place(name="Newark, New Jersey", lat=40.7357, lng=-74.1724, city_state="Newark, NJ")

PLACES = {
    "Dallas, TX": DALLAS,
    "Oklahoma City, OK": OKC,
    "Newark, NJ": NEWARK,
}


def make_route(distance_mi: float, offset: float) -> Route:
    return Route(
        distance_mi=distance_mi,
        duration_hr=distance_mi / 57.0,
        geometry=[(32.7767, -96.7970), (35.4676, -97.5164), (40.7357, -74.1724)],
        steps=[
            Step("Head north", distance_mi / 2, distance_mi / 114.0, offset),
            Step("Arrive", distance_mi / 2, distance_mi / 114.0, offset + distance_mi / 2),
        ],
        provider="osrm/driving",
    )


@pytest.fixture
def stub_geo(monkeypatch):
    """Deterministic geocoding and routing.

    Patched on `services.planning`, which is the module that actually calls the
    geo layer — patching the package would only rebind a re-export.
    """
    from apps.geo.providers import GeoError
    from apps.trips.services import planning

    def geocode(q):
        if q in PLACES:
            return PLACES[q]
        raise GeoError(f"no match for {q!r}")

    calls = {"routes": 0}

    def route(points, *, mile_offset=0.0):
        calls["routes"] += 1
        return make_route(205.0 if calls["routes"] == 1 else 1440.0, mile_offset)

    monkeypatch.setattr(planning.geo, "geocode", geocode)
    monkeypatch.setattr(planning.geo, "route", route)
    monkeypatch.setattr(planning.geo, "reverse", lambda lat, lng: "Somewhere, MO")
    return calls


@pytest.fixture
def api():
    return APIClient()


PAYLOAD = {
    "current_location": "Dallas, TX",
    "pickup_location": "Oklahoma City, OK",
    "dropoff_location": "Newark, NJ",
    "current_cycle_used": 58.0,
}


# --------------------------------------------------------------------------- #
# Health
# --------------------------------------------------------------------------- #


def test_health(api):
    assert api.get("/api/health/").status_code == 200


# --------------------------------------------------------------------------- #
# Creating a trip
# --------------------------------------------------------------------------- #


def test_create_returns_the_whole_plan_in_one_response(api, stub_geo):
    r = api.post("/api/trips/", PAYLOAD, format="json")
    assert r.status_code == 201
    body = r.json()

    # everything the results page needs, without a second round trip
    for key in ("summary", "legs", "stops", "steps", "log_days", "route_geometry", "violations"):
        assert key in body, key


def test_created_trip_is_compliant_and_has_multiple_sheets(api, stub_geo):
    body = api.post("/api/trips/", PAYLOAD, format="json").json()
    assert body["is_compliant"] is True
    assert body["violations"] == []
    assert len(body["log_days"]) >= 3  # 1,645 mi with only 12 cycle hours left


def test_every_log_sheet_totals_24_hours(api, stub_geo):
    """"The total of the entries must equal 24 hours" — guide p.16."""
    body = api.post("/api/trips/", PAYLOAD, format="json").json()
    for day in body["log_days"]:
        assert day["total_hours"] == pytest.approx(24.0, abs=0.01), day["date"]


def test_segments_are_gapless_and_span_the_day(api, stub_geo):
    body = api.post("/api/trips/", PAYLOAD, format="json").json()
    for day in body["log_days"]:
        segs = day["segments"]
        assert segs[0]["start_minute"] == 0
        assert segs[-1]["end_minute"] == 1440
        for a, b in zip(segs, segs[1:], strict=False):
            assert a["end_minute"] == b["start_minute"]


def test_cycle_exhaustion_produces_a_34_hour_restart(api, stub_geo):
    body = api.post("/api/trips/", PAYLOAD, format="json").json()
    kinds = [s["kind"] for s in body["stops"]]
    assert "restart_34" in kinds


def test_stops_carry_coordinates_and_a_location(api, stub_geo):
    """Regression: without `annotate_stops` these come back blank."""
    body = api.post("/api/trips/", PAYLOAD, format="json").json()
    for stop in body["stops"]:
        assert stop["lat"] is not None and stop["lng"] is not None, stop["kind"]
        assert stop["location"], stop["kind"]


def test_remarks_are_populated(api, stub_geo):
    """Guide p.17 requires a city/state at every change of duty status."""
    body = api.post("/api/trips/", PAYLOAD, format="json").json()
    assert any(day["remarks"] for day in body["log_days"])


def test_steps_are_returned_as_route_instructions(api, stub_geo):
    """The brief's Objective line asks for "route instructions", not just a map."""
    body = api.post("/api/trips/", PAYLOAD, format="json").json()
    assert len(body["steps"]) >= 2
    assert body["steps"][0]["instruction"]


def test_steps_and_stops_share_a_mile_marker_axis(api, stub_geo):
    """So the UI can interleave directions and HOS stops with one sort."""
    body = api.post("/api/trips/", PAYLOAD, format="json").json()
    markers = [s["mile_marker"] for s in body["steps"]]
    assert markers == sorted(markers)
    assert max(s["mile_marker"] for s in body["stops"]) <= body["summary"]["total_miles"] + 1


def test_recap_box_c_matches_the_cycle_input_plus_work_done(api, stub_geo):
    body = api.post("/api/trips/", PAYLOAD, format="json").json()
    first = body["log_days"][0]["recap"]
    assert first["total_last_8_days"] == pytest.approx(
        58.0 + first["on_duty_today"], abs=0.01
    )


def test_geometry_is_simplified(api, stub_geo):
    body = api.post("/api/trips/", PAYLOAD, format="json").json()
    assert isinstance(body["route_geometry"], list)
    assert all(len(p) == 2 for p in body["route_geometry"])


# --------------------------------------------------------------------------- #
# Validation and failure
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("missing", ["current_location", "pickup_location", "dropoff_location", "current_cycle_used"])
def test_missing_required_input_is_a_400(api, stub_geo, missing):
    payload = {k: v for k, v in PAYLOAD.items() if k != missing}
    r = api.post("/api/trips/", payload, format="json")
    assert r.status_code == 400
    assert missing in r.json()


@pytest.mark.parametrize("cycle", [-1, 70.1, 200])
def test_cycle_used_must_be_between_0_and_70(api, stub_geo, cycle):
    r = api.post("/api/trips/", PAYLOAD | {"current_cycle_used": cycle}, format="json")
    assert r.status_code == 400
    assert "current_cycle_used" in r.json()


def test_cycle_used_of_exactly_70_is_accepted(api, stub_geo):
    """A driver at the limit is the interesting case, not an invalid one."""
    r = api.post("/api/trips/", PAYLOAD | {"current_cycle_used": 70}, format="json")
    assert r.status_code == 201
    assert "restart_34" in [s["kind"] for s in r.json()["stops"]]


def test_identical_pickup_and_dropoff_is_rejected(api, stub_geo):
    payload = PAYLOAD | {"dropoff_location": "Oklahoma City, OK"}
    r = api.post("/api/trips/", payload, format="json")
    assert r.status_code == 400
    assert "dropoff_location" in r.json()


def test_unknown_address_is_a_422_not_a_500(api, stub_geo):
    """A bad address is the caller's problem; the UI should show it on the field."""
    r = api.post("/api/trips/", PAYLOAD | {"pickup_location": "Zzzz"}, format="json")
    assert r.status_code == 422
    assert "detail" in r.json()


def test_routing_failure_is_a_422(api, stub_geo, monkeypatch):
    from apps.geo.providers import GeoError
    from apps.trips.services import planning

    def boom(*a, **kw):
        raise GeoError("routing unavailable")

    monkeypatch.setattr(planning.geo, "route", boom)
    r = api.post("/api/trips/", PAYLOAD, format="json")
    assert r.status_code == 422


def test_nothing_is_persisted_when_planning_fails(api, stub_geo):
    """The whole create is one transaction."""
    from apps.trips.models import Trip

    api.post("/api/trips/", PAYLOAD | {"pickup_location": "Zzzz"}, format="json")
    assert Trip.objects.count() == 0


# --------------------------------------------------------------------------- #
# Retrieval and history
# --------------------------------------------------------------------------- #


def test_trip_is_retrievable_by_id(api, stub_geo):
    created = api.post("/api/trips/", PAYLOAD, format="json").json()
    fetched = api.get(f"/api/trips/{created['id']}/").json()
    assert fetched["id"] == created["id"]
    assert len(fetched["log_days"]) == len(created["log_days"])
    assert fetched["summary"]["total_miles"] == created["summary"]["total_miles"]


def test_history_lists_trips_newest_first(api, stub_geo):
    api.post("/api/trips/", PAYLOAD, format="json")
    api.post("/api/trips/", PAYLOAD | {"current_cycle_used": 10}, format="json")

    rows = api.get("/api/trips/").json()
    assert len(rows) == 2
    assert rows[0]["created_at"] >= rows[1]["created_at"]
    assert "log_sheet_count" in rows[0]


def test_missing_trip_is_a_404(api):
    assert api.get("/api/trips/99999/").status_code == 404


# --------------------------------------------------------------------------- #
# Geocode proxy
# --------------------------------------------------------------------------- #


def test_geocode_suggest_proxies_results(api, monkeypatch):
    from apps.trips import views

    monkeypatch.setattr(views.geo, "suggest", lambda q, limit=6: [DALLAS])
    body = api.get("/api/geocode/?q=dall").json()
    assert body[0]["city_state"] == "Dallas, TX"
    assert {"name", "lat", "lng", "city_state"} == set(body[0])


def test_geocode_suggest_ignores_short_queries(api, monkeypatch):
    from apps.trips import views

    called = []
    monkeypatch.setattr(views.geo, "suggest", lambda q, limit=6: called.append(q) or [])
    assert api.get("/api/geocode/?q=d").json() == []
    assert called == []


def test_only_the_final_leg_keeps_its_arrival_instruction(api, stub_geo):
    """The first leg's destination is the pickup, not the end of the trip.

    Leaving both "Arrive at your destination" steps in makes the directions read
    as though the trip finishes twice, and the stray one sorts into the middle of
    the second leg because both share a mile marker.
    """
    body = api.post("/api/trips/", PAYLOAD, format="json").json()
    arrivals = [s for s in body["steps"] if s["instruction"].lower().startswith("arrive")]
    assert len(arrivals) == 1
    assert arrivals[0]["sequence"] == body["steps"][-1]["sequence"]
