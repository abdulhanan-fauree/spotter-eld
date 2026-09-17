"""API views.

`POST /api/trips/` returns the *entire* plan in one payload — route, stops,
turn-by-turn steps and every log sheet. Planning is two cached HTTP calls plus
pure computation, well under a second, so a create-then-poll dance would only add
latency and failure modes.

`DELETE /api/trips/<id>/` removes a saved plan and everything hanging off it.
"""

from __future__ import annotations

import logging

from django.db import DatabaseError, connection
from django.db.models import Prefetch
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response

from apps.geo import service as geo
from apps.geo.providers import GeoError

from .models import LogDay, Trip
from .serializers import (
    PlaceSerializer,
    TripDetailSerializer,
    TripInputSerializer,
    TripListSerializer,
)
from .services import plan_and_persist
from .throttling import GeocodeThrottle, PlanningThrottle

log = logging.getLogger(__name__)

# Longer than any real place name. Past this it is a paste, not a search, and
# forwarding it to Nominatim would only spend our quota.
MAX_GEOCODE_QUERY = 200


def _detail_queryset():
    return Trip.objects.prefetch_related(
        "legs",
        "stops",
        "steps",
        Prefetch("log_days", queryset=LogDay.objects.prefetch_related("segments", "remark_entries")),
    )


class TripViewSet(mixins.DestroyModelMixin, viewsets.ReadOnlyModelViewSet):
    """List, retrieve, plan and delete trips.

    Deletion cascades through legs, steps, stops and log sheets via the model
    `on_delete` rules. The API has no authentication anywhere, so removing a plan
    is exactly as open as creating one.
    """

    queryset = Trip.objects.all()

    def get_queryset(self):
        return _detail_queryset() if self.action == "retrieve" else Trip.objects.all()

    def get_serializer_class(self):
        return TripDetailSerializer if self.action == "retrieve" else TripListSerializer

    def get_throttles(self):
        # Only planning is expensive. Reads and deletes stay unlimited so the
        # history page never stalls behind someone else's planning burst.
        return [PlanningThrottle()] if self.action == "create" else []

    def create(self, request):
        """Plan a trip and return it in full.

        `PlanningError` and anything unexpected are translated by
        `apps.trips.exceptions.api_exception_handler`, so this reads as the happy
        path it is.
        """
        form = TripInputSerializer(data=request.data)
        form.is_valid(raise_exception=True)

        trip = _detail_queryset().get(pk=plan_and_persist(form.validated_data).pk)
        return Response(TripDetailSerializer(trip).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@throttle_classes([GeocodeThrottle])
def geocode_suggest(request):
    """Typeahead for the three location fields.

    Proxied so the browser never sees an API key and so every lookup lands in the
    shared cache — Nominatim allows one request per second.
    """
    query = request.query_params.get("q", "").strip()
    if len(query) < 2:
        return Response([])
    if len(query) > MAX_GEOCODE_QUERY:
        raise ValidationError({"q": [f"Keep the search under {MAX_GEOCODE_QUERY} characters."]})

    try:
        places = geo.suggest(query, limit=6)
    except GeoError as exc:
        # The upstream is down or rate-limiting us. Say so with the right status
        # rather than letting it surface as an unexplained failure.
        log.warning("geocode suggest unavailable: %s", exc)
        return Response(
            {"detail": "Address suggestions are unavailable right now. You can still type a city and state."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return Response(PlaceSerializer([p.__dict__ for p in places], many=True).data)


def _database_ok() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return True
    except DatabaseError:
        log.exception("health check: database unreachable")
        return False


@api_view(["GET"])
def health(_request):
    """Liveness, plus the one dependency that can be silently misconfigured.

    A bad `DATABASE_URL` otherwise shows up only as the first real request
    failing; here it shows up as a 503 the deploy can be checked against.
    """
    ok = _database_ok()
    return Response(
        {"status": "ok" if ok else "degraded", "database": "ok" if ok else "error"},
        status=status.HTTP_200_OK if ok else status.HTTP_503_SERVICE_UNAVAILABLE,
    )


@api_view(["GET", "POST", "PUT", "PATCH", "DELETE"])
def not_found(_request, *_args, **_kwargs):
    """Catch-all under /api/, so an unknown path answers in JSON like everything else."""
    raise NotFound("No such endpoint.")
