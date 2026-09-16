"""API views.

`POST /api/trips/` returns the *entire* plan in one payload — route, stops,
turn-by-turn steps and every log sheet. Planning is two cached HTTP calls plus
pure computation, well under a second, so a create-then-poll dance would only add
latency and failure modes.
"""

from __future__ import annotations

import logging

from django.db.models import Prefetch
from rest_framework import status, viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.geo import service as geo

from .models import LogDay, Trip
from .serializers import (
    PlaceSerializer,
    TripDetailSerializer,
    TripInputSerializer,
    TripListSerializer,
)
from .services import plan_and_persist

log = logging.getLogger(__name__)


def _detail_queryset():
    return Trip.objects.prefetch_related(
        "legs",
        "stops",
        "steps",
        Prefetch("log_days", queryset=LogDay.objects.prefetch_related("segments", "remark_entries")),
    )


class TripViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Trip.objects.all()

    def get_queryset(self):
        return _detail_queryset() if self.action == "retrieve" else Trip.objects.all()

    def get_serializer_class(self):
        return TripDetailSerializer if self.action == "retrieve" else TripListSerializer

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
def geocode_suggest(request):
    """Typeahead for the three location fields.

    Proxied so the browser never sees an API key and so every lookup lands in the
    shared cache — Nominatim allows one request per second.
    """
    query = request.query_params.get("q", "").strip()
    if len(query) < 2:
        return Response([])
    places = geo.suggest(query, limit=6)
    return Response(PlaceSerializer([p.__dict__ for p in places], many=True).data)


@api_view(["GET"])
def health(_request):
    return Response({"status": "ok"})
