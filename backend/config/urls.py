from django.urls import include, path, re_path

from apps.trips.views import not_found

urlpatterns = [
    path("api/", include("apps.trips.urls")),
    # Anything else under /api/ answers in JSON rather than Django's HTML page,
    # so a client with a stale URL gets a body it can read.
    re_path(r"^api/.*$", not_found),
]
