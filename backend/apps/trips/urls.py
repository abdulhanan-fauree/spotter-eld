from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import TripViewSet, geocode_suggest, health

router = DefaultRouter()
router.register("trips", TripViewSet, basename="trip")

urlpatterns = [
    path("", include(router.urls)),
    path("geocode/", geocode_suggest, name="geocode"),
    path("health/", health, name="health"),
]
