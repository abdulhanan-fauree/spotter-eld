from django.apps import AppConfig


class TripsConfig(AppConfig):
    """Trip planning, persistence and the public API."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.trips"
    verbose_name = "Trips"
