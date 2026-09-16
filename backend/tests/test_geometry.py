"""Route geometry. Pure functions, no Django, no network.

`point_at_mile` is the one that matters: it is what turns the planner's
`mile_marker` into a map pin and a Remarks entry, so an error here silently
mislocates every fuel stop and rest on the trip.
"""

from __future__ import annotations

import pytest

from apps.geo import geometry as g

# Real coordinates, so the distances can be sanity-checked against reality.
DALLAS = (32.7767, -96.7970)
OKC = (35.4676, -97.5164)
CHICAGO = (41.8781, -87.6298)
NEWARK = (40.7357, -74.1724)


# --------------------------------------------------------------------------- #
# haversine
# --------------------------------------------------------------------------- #


def test_haversine_zero_for_identical_points():
    assert g.haversine_mi(DALLAS, DALLAS) == pytest.approx(0.0)


def test_haversine_is_symmetric():
    assert g.haversine_mi(DALLAS, OKC) == pytest.approx(g.haversine_mi(OKC, DALLAS))


def test_haversine_matches_known_distances():
    """Great-circle ("as the crow flies") distances, not road distances.

    Cross-validated against the spherical law of cosines, which agrees to 1e-6.
    Dallas->OKC is ~190 mi straight-line but ~206 mi by road; using the road
    figure here is an easy way to "fix" a correct implementation into a wrong one.
    """
    assert g.haversine_mi(DALLAS, OKC) == pytest.approx(190.4, rel=0.001)
    assert g.haversine_mi(CHICAGO, NEWARK) == pytest.approx(702.2, rel=0.001)


def test_one_degree_of_latitude_is_about_69_miles():
    assert g.haversine_mi((0.0, 0.0), (1.0, 0.0)) == pytest.approx(69.1, rel=0.01)


# --------------------------------------------------------------------------- #
# GeoJSON coordinate order — the classic bug in this layer
# --------------------------------------------------------------------------- #


def test_from_geojson_swaps_lng_lat_to_lat_lng():
    assert g.from_geojson([[-96.7970, 32.7767]]) == [(32.7767, -96.7970)]


def test_geojson_round_trip():
    points = [DALLAS, OKC, CHICAGO]
    assert g.from_geojson(g.to_geojson(points)) == points


# --------------------------------------------------------------------------- #
# cumulative distance
# --------------------------------------------------------------------------- #


def test_cumulative_starts_at_zero_and_matches_length():
    points = [DALLAS, OKC, CHICAGO]
    cum = g.cumulative_miles(points)
    assert len(cum) == len(points)
    assert cum[0] == 0.0
    assert cum == sorted(cum)


def test_cumulative_last_equals_total():
    points = [DALLAS, OKC, CHICAGO, NEWARK]
    assert g.cumulative_miles(points)[-1] == pytest.approx(g.total_miles(points))


def test_total_miles_of_a_single_point_is_zero():
    assert g.total_miles([DALLAS]) == 0.0


# --------------------------------------------------------------------------- #
# point_at_mile
# --------------------------------------------------------------------------- #


@pytest.fixture
def straight_line():
    """A due-north line from the equator, ~69 miles per degree."""
    return [(float(lat), 0.0) for lat in range(0, 11)]


def test_point_at_mile_returns_endpoints_at_the_extremes(straight_line):
    assert g.point_at_mile(straight_line, 0) == straight_line[0]
    assert g.point_at_mile(straight_line, 10_000) == straight_line[-1]


def test_point_at_mile_clamps_negative_input(straight_line):
    assert g.point_at_mile(straight_line, -50) == straight_line[0]


def test_point_at_mile_lands_on_vertices(straight_line):
    cum = g.cumulative_miles(straight_line)
    for i, mile in enumerate(cum):
        lat, lng = g.point_at_mile(straight_line, mile, cum)
        assert lat == pytest.approx(straight_line[i][0], abs=1e-6)


def test_point_at_mile_interpolates_within_a_segment(straight_line):
    """Halfway along the first degree should be latitude ~0.5."""
    cum = g.cumulative_miles(straight_line)
    lat, _ = g.point_at_mile(straight_line, cum[1] / 2, cum)
    assert lat == pytest.approx(0.5, abs=1e-6)


def test_point_at_mile_is_monotonic(straight_line):
    cum = g.cumulative_miles(straight_line)
    lats = [g.point_at_mile(straight_line, m, cum)[0] for m in range(0, int(cum[-1]), 25)]
    assert lats == sorted(lats)


def test_point_at_mile_distance_is_self_consistent(straight_line):
    """Walking to mile X should put you X miles along the line."""
    cum = g.cumulative_miles(straight_line)
    for target in (50.0, 200.0, 500.0):
        p = g.point_at_mile(straight_line, target, cum)
        walked = g.total_miles([straight_line[0], p])
        assert walked == pytest.approx(target, rel=0.001)


def test_point_at_mile_rejects_empty_geometry():
    with pytest.raises(ValueError):
        g.point_at_mile([], 10)


def test_point_at_mile_handles_single_point():
    assert g.point_at_mile([DALLAS], 10) == DALLAS


def test_duplicate_vertices_do_not_break_interpolation():
    """Routing APIs sometimes emit repeated shape points; a zero-length segment
    must not produce a division by zero."""
    points = [(0.0, 0.0), (1.0, 0.0), (1.0, 0.0), (2.0, 0.0)]
    cum = g.cumulative_miles(points)
    assert g.point_at_mile(points, cum[1], cum) == pytest.approx((1.0, 0.0))


# --------------------------------------------------------------------------- #
# rescale — reconciling road distance with great-circle shape-point distance
# --------------------------------------------------------------------------- #


def test_rescale_makes_the_polyline_match_the_reported_distance(straight_line):
    rescaled = g.rescale(straight_line, 1000.0)
    assert rescaled[-1] == pytest.approx(1000.0)
    assert rescaled[0] == 0.0
    assert rescaled == sorted(rescaled)


def test_rescale_is_a_noop_for_zero_target(straight_line):
    assert g.rescale(straight_line, 0.0) == g.cumulative_miles(straight_line)


def test_mile_markers_stay_within_the_route_after_rescaling(straight_line):
    """A stop at mile 999 of a 1000-mile route must not fall off the end."""
    cum = g.rescale(straight_line, 1000.0)
    p = g.point_at_mile(straight_line, 999.0, cum)
    assert p != straight_line[-1]  # genuinely interpolated, not clamped


# --------------------------------------------------------------------------- #
# simplify / bounding box
# --------------------------------------------------------------------------- #


def test_simplify_preserves_endpoints(straight_line):
    out = g.simplify(straight_line, tolerance_mi=200)
    assert out[0] == straight_line[0]
    assert out[-1] == straight_line[-1]


def test_simplify_drops_dense_points(straight_line):
    assert len(g.simplify(straight_line, tolerance_mi=200)) < len(straight_line)


def test_simplify_keeps_short_geometries_intact():
    assert g.simplify([DALLAS, OKC]) == [DALLAS, OKC]


def test_simplify_preserves_overall_length_approximately(straight_line):
    before = g.total_miles(straight_line)
    after = g.total_miles(g.simplify(straight_line, tolerance_mi=100))
    assert after == pytest.approx(before, rel=0.02)


def test_bounding_box():
    assert g.bounding_box([DALLAS, CHICAGO]) == (
        pytest.approx(32.7767),
        pytest.approx(-96.7970),
        pytest.approx(41.8781),
        pytest.approx(-87.6298),
    )
