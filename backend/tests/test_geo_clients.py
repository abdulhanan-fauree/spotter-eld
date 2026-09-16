"""Geo clients, driven through a mocked httpx transport.

No network: every response is a fixture shaped like the real service's, so these
tests stay fast and deterministic and cannot rate-limit anyone. What they check
is the parsing and the fallback policy, which is where the bugs actually live.
"""

from __future__ import annotations

import httpx
import pytest
from django.test import override_settings

from apps.geo import providers as clients
from apps.geo.providers import GeoError

pytestmark = pytest.mark.django_db


# --------------------------------------------------------------------------- #
# Fixtures shaped like the real payloads
# --------------------------------------------------------------------------- #

NOMINATIM_HIT = [
    {
        "display_name": "Amarillo, Potter County, Texas, United States",
        "lat": "35.2219971",
        "lon": "-101.8312969",
        "address": {
            "city": "Amarillo",
            "county": "Potter County",
            "state": "Texas",
            "ISO3166-2-lvl4": "US-TX",
            "country_code": "us",
        },
    }
]

OSRM_OK = {
    "code": "Ok",
    "routes": [
        {
            "distance": 321868.8,  # metres -> 200.0 mi
            "duration": 12960.0,  # seconds -> 3.6 h
            "geometry": {"coordinates": [[-96.797, 32.7767], [-97.5164, 35.4676]]},
            "legs": [
                {
                    "steps": [
                        {
                            "distance": 160934.4,
                            "duration": 6480.0,
                            "name": "I-35 N",
                            "maneuver": {"type": "turn", "modifier": "left"},
                        },
                        {
                            "distance": 160934.4,
                            "duration": 6480.0,
                            "name": "",
                            "maneuver": {"type": "arrive"},
                        },
                    ]
                }
            ],
        }
    ],
}

ORS_OK = {
    "features": [
        {
            "properties": {
                "summary": {"distance": 205.4, "duration": 13320.0},
                "segments": [
                    {
                        "steps": [
                            {"instruction": "Head north on I-35", "distance": 105.4, "duration": 6660.0},
                            {"instruction": "Arrive at your destination", "distance": 100.0, "duration": 6660.0},
                        ]
                    }
                ],
            },
            "geometry": {"coordinates": [[-96.797, 32.7767], [-97.5164, 35.4676]]},
        }
    ]
}


def transport(handler):
    """Patch httpx.Client so every request goes to `handler`."""
    real = httpx.Client

    def factory(**kwargs):
        kwargs.pop("transport", None)
        return real(transport=httpx.MockTransport(handler), **kwargs)

    return factory


@pytest.fixture
def mock_http(monkeypatch):
    """Route every provider's HTTP through `handler`.

    Patched on `httpx` itself rather than on any one module: all providers build
    their client through `providers.base.http_client`, so one patch covers
    Nominatim, Photon, ORS and OSRM alike.
    """

    def install(handler):
        monkeypatch.setattr(httpx, "Client", transport(handler))

    return install


# --------------------------------------------------------------------------- #
# Geocoding
# --------------------------------------------------------------------------- #


def test_geocode_parses_a_nominatim_hit(mock_http):
    mock_http(lambda req: httpx.Response(200, json=NOMINATIM_HIT))
    place = clients.geocode("Amarillo TX")
    assert (place.lat, place.lng) == (pytest.approx(35.222, abs=1e-3), pytest.approx(-101.831, abs=1e-3))


def test_geocode_prefers_the_iso_code_for_the_state_abbreviation(mock_http):
    """Remarks require the abbreviation, and ISO3166-2 gives it to us directly."""
    mock_http(lambda req: httpx.Response(200, json=NOMINATIM_HIT))
    assert clients.geocode("Amarillo TX").city_state == "Amarillo, TX"


def test_geocode_falls_back_to_the_state_name_map(mock_http):
    payload = [dict(NOMINATIM_HIT[0])]
    payload[0]["address"] = {"town": "Cherry Hill", "state": "New Jersey"}
    mock_http(lambda req: httpx.Response(200, json=payload))
    assert clients.geocode("Cherry Hill").city_state == "Cherry Hill, NJ"


def test_geocode_raises_when_nothing_matches(mock_http):
    mock_http(lambda req: httpx.Response(200, json=[]))
    with pytest.raises(GeoError, match="no match"):
        clients.geocode("qqqqzzzz not a place")


def test_geocode_raises_on_an_empty_query():
    with pytest.raises(GeoError):
        clients.geocode("   ")


def test_geocode_raises_when_the_service_is_down(mock_http):
    mock_http(lambda req: httpx.Response(503))
    with pytest.raises(GeoError, match="unavailable"):
        clients.geocode("Dallas TX")


def test_geocode_sends_a_real_user_agent(mock_http):
    """Nominatim's usage policy requires an identifying User-Agent."""
    seen = {}

    def handler(request):
        seen["ua"] = request.headers.get("user-agent", "")
        return httpx.Response(200, json=NOMINATIM_HIT)

    mock_http(handler)
    clients.geocode("Dallas TX")
    assert "spotter" in seen["ua"].lower()


# --------------------------------------------------------------------------- #
# Reverse geocoding — never allowed to break a plan
# --------------------------------------------------------------------------- #


def test_reverse_returns_city_state(mock_http):
    mock_http(lambda req: httpx.Response(200, json={"address": NOMINATIM_HIT[0]["address"]}))
    assert clients.reverse(35.22, -101.83) == "Amarillo, TX"


def test_reverse_degrades_to_empty_rather_than_raising(mock_http):
    """A missing Remarks entry is a cosmetic loss; a failed trip plan is not."""
    mock_http(lambda req: httpx.Response(500))
    assert clients.reverse(35.22, -101.83) == ""


# --------------------------------------------------------------------------- #
# Autocomplete
# --------------------------------------------------------------------------- #


def test_suggest_parses_photon_features(mock_http):
    payload = {
        "features": [
            {
                "geometry": {"coordinates": [-96.797, 32.7767]},
                "properties": {"name": "Dallas", "city": "Dallas", "state": "Texas", "country": "United States"},
            }
        ]
    }
    mock_http(lambda req: httpx.Response(200, json=payload))
    out = clients.suggest("dall")
    assert len(out) == 1
    assert out[0].city_state == "Dallas, TX"


def test_suggest_returns_empty_for_a_too_short_query():
    assert clients.suggest("d") == []


def test_suggest_degrades_to_empty_on_failure(mock_http):
    mock_http(lambda req: httpx.Response(502))
    assert clients.suggest("dallas") == []


# --------------------------------------------------------------------------- #
# Routing
# --------------------------------------------------------------------------- #


@override_settings(ORS_API_KEY="")
def test_route_uses_osrm_when_no_ors_key(mock_http):
    mock_http(lambda req: httpx.Response(200, json=OSRM_OK))
    r = clients.route([(32.7767, -96.797), (35.4676, -97.5164)])
    assert r.provider == "osrm/driving"
    assert r.distance_mi == pytest.approx(200.0, abs=0.1)
    assert r.duration_hr == pytest.approx(3.6, abs=0.01)


@override_settings(ORS_API_KEY="")
def test_osrm_geometry_is_lat_lng_not_lng_lat(mock_http):
    mock_http(lambda req: httpx.Response(200, json=OSRM_OK))
    r = clients.route([(32.7767, -96.797), (35.4676, -97.5164)])
    assert r.geometry[0] == (pytest.approx(32.7767), pytest.approx(-96.797))


@override_settings(ORS_API_KEY="test-key")
def test_route_prefers_the_truck_profile_when_a_key_is_present(mock_http):
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        return httpx.Response(200, json=ORS_OK)

    mock_http(handler)
    r = clients.route([(32.7767, -96.797), (35.4676, -97.5164)])
    assert "driving-hgv" in seen["url"]
    assert r.provider == "openrouteservice/driving-hgv"
    assert r.distance_mi == pytest.approx(205.4)


@override_settings(ORS_API_KEY="test-key")
def test_route_falls_back_to_osrm_when_ors_fails(mock_http):
    """A demo must not die because a free tier hiccuped."""

    def handler(request):
        if "openrouteservice" in str(request.url):
            return httpx.Response(429, json={"error": "quota exceeded"})
        return httpx.Response(200, json=OSRM_OK)

    mock_http(handler)
    r = clients.route([(32.7767, -96.797), (35.4676, -97.5164)])
    assert r.provider == "osrm/driving"


@override_settings(ORS_API_KEY="")
def test_route_raises_when_every_provider_fails(mock_http):
    mock_http(lambda req: httpx.Response(500))
    with pytest.raises(GeoError, match="routing unavailable"):
        clients.route([(32.7767, -96.797), (35.4676, -97.5164)])


@override_settings(ORS_API_KEY="")
def test_route_raises_on_an_osrm_no_route_response(mock_http):
    mock_http(lambda req: httpx.Response(200, json={"code": "NoRoute", "message": "no route"}))
    with pytest.raises(GeoError):
        clients.route([(32.7767, -96.797), (35.4676, -97.5164)])


def test_route_needs_two_points():
    with pytest.raises(GeoError, match="two points"):
        clients.route([(32.7767, -96.797)])


# --------------------------------------------------------------------------- #
# Steps carry trip-absolute mile markers — the join key with the planner
# --------------------------------------------------------------------------- #


@override_settings(ORS_API_KEY="")
def test_step_mile_markers_are_cumulative_and_offset(mock_http):
    mock_http(lambda req: httpx.Response(200, json=OSRM_OK))
    r = clients.route([(32.7767, -96.797), (35.4676, -97.5164)], mile_offset=380.0)
    assert [s.mile_marker for s in r.steps] == [pytest.approx(380.0), pytest.approx(480.0)]


@override_settings(ORS_API_KEY="test-key")
def test_ors_steps_carry_instructions(mock_http):
    mock_http(lambda req: httpx.Response(200, json=ORS_OK))
    r = clients.route([(32.7767, -96.797), (35.4676, -97.5164)])
    assert r.steps[0].instruction == "Head north on I-35"


# --------------------------------------------------------------------------- #
# Turn-by-turn phrasing — a named deliverable, not a nicety
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "step,expected",
    [
        ({"maneuver": {"type": "depart"}, "name": "Main St"}, "Start out onto Main St"),
        ({"maneuver": {"type": "arrive"}, "name": ""}, "Arrive at your destination"),
        ({"maneuver": {"type": "turn", "modifier": "right"}, "name": "South Akard Street"},
         "Turn right onto South Akard Street"),
        ({"maneuver": {"type": "turn", "modifier": "straight"}, "name": "I-35 N"}, "Continue onto I-35 N"),
        ({"maneuver": {"type": "end of road", "modifier": "left"}, "name": "Marilla Street"},
         "Turn left at the end of the road onto Marilla Street"),
        ({"maneuver": {"type": "merge", "modifier": "slight left"}, "name": "I-40 E"},
         "Merge slight left onto I-40 E"),
        ({"maneuver": {"type": "on ramp"}, "name": "I-44 W"}, "Take the ramp onto I-44 W"),
        ({"maneuver": {"type": "off ramp"}, "name": "Exit 76"}, "Take the exit onto Exit 76"),
        ({"maneuver": {"type": "fork", "modifier": "right"}, "name": "US-287"}, "Keep right onto US-287"),
        ({"maneuver": {"type": "roundabout", "exit": 2}, "name": "High St"},
         "At the roundabout, take exit 2 onto High St"),
        ({"maneuver": {"type": "turn", "modifier": "uturn"}, "name": "Broad St"},
         "Make a U-turn onto Broad St"),
        ({"maneuver": {"type": "new name"}, "name": "Route 9"}, "Continue onto Route 9"),
        ({"maneuver": {}, "name": ""}, "Continue"),
    ],
)
def test_osrm_instructions_read_like_directions(step, expected):
    assert clients._osrm_instruction(step) == expected


def test_instruction_does_not_lowercase_road_names():
    """Regression: str.capitalize() lowercases everything after the first char,
    turning "South Akard Street" into "south akard street"."""
    out = clients._osrm_instruction(
        {"maneuver": {"type": "turn", "modifier": "right"}, "name": "South Akard Street"}
    )
    assert "South Akard Street" in out


def test_instruction_falls_back_to_the_road_ref():
    out = clients._osrm_instruction({"maneuver": {"type": "on ramp"}, "name": "", "ref": "I-70 E"})
    assert out == "Take the ramp onto I-70 E"


# --------------------------------------------------------------------------- #
# Reverse geocoding falls through to the nearest town — guide p.17
# --------------------------------------------------------------------------- #

RURAL_NOMINATIM = {"address": {"county": "Wayne County", "state": "Indiana",
                               "ISO3166-2-lvl4": "US-IN", "country_code": "us"}}

PHOTON_PLACES = {
    "features": [
        {"properties": {"name": "47327", "osm_value": "postcode", "state": "Indiana"}},
        {"properties": {"name": "Mount Auburn", "osm_value": "hamlet", "state": "Indiana"}},
        {"properties": {"name": "Cambridge City", "osm_value": "village", "state": "Indiana"}},
    ]
}


def _tiered(mock_http, photon_payload):
    def handler(request):
        if "photon" in str(request.url):
            return httpx.Response(200, json=photon_payload)
        return httpx.Response(200, json=RURAL_NOMINATIM)

    mock_http(handler)


def test_rural_point_falls_back_to_the_nearest_village_not_the_county(mock_http):
    """A rest area on I-70 is in no town, so Nominatim answers with a county.

    "Wayne County, IN" is not a city, town or village. The reg wants the nearest
    settlement, so Photon is consulted before the county is accepted.
    """
    _tiered(mock_http, PHOTON_PLACES)
    assert clients.reverse(39.8531, -85.1852) == "Cambridge City, IN"


def test_reverse_ignores_postcodes_returned_as_places(mock_http):
    _tiered(mock_http, PHOTON_PLACES)
    assert "47327" not in clients.reverse(39.8531, -85.1852)


def test_reverse_prefers_village_over_nearer_hamlet(mock_http):
    """The reg names "city, town, or village"; a hamlet is only a last resort,
    even when it is closer."""
    _tiered(mock_http, PHOTON_PLACES)
    assert clients.reverse(39.8531, -85.1852) == "Cambridge City, IN"


def test_reverse_accepts_a_hamlet_when_there_is_nothing_larger(mock_http):
    only_hamlets = {"features": [
        {"properties": {"name": "Powellville", "osm_value": "hamlet", "state": "Missouri"}},
    ]}
    _tiered(mock_http, only_hamlets)
    assert clients.reverse(37.8916, -92.0121) == "Powellville, MO"


def test_reverse_settles_for_the_county_when_photon_finds_nothing(mock_http):
    _tiered(mock_http, {"features": []})
    assert clients.reverse(39.8531, -85.1852) == "Wayne County, IN"


def test_reverse_skips_photon_when_nominatim_names_a_town(mock_http):
    """No second call when the first answer is already a settlement."""
    seen = []

    def handler(request):
        seen.append("photon" if "photon" in str(request.url) else "nominatim")
        return httpx.Response(200, json={"address": NOMINATIM_HIT[0]["address"]})

    mock_http(handler)
    assert clients.reverse(35.22, -101.83) == "Amarillo, TX"
    assert "photon" not in seen


def test_photon_reverse_does_not_use_the_api_prefix():
    """Regression: /api/reverse 404s — reverse lives at the root, search under /api."""
    assert clients.PHOTON_REVERSE.endswith("/reverse")
    assert "/api/" not in clients.PHOTON_REVERSE
