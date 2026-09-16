"""Trip persistence.

Shapes mirror what the UI renders, so the serializers stay thin. In particular
`DutySegment` stores minutes past the start of the log sheet (0-1440) rather than
timestamps: the SVG renderer's job then reduces to `minute -> x`, with no
timezone arithmetic on the client. All timezone work happens once, server-side,
in the home-terminal zone.
"""

from __future__ import annotations

from django.db import models

from apps.hos.types import DutyStatus, StopKind

DUTY_CHOICES = [(s.value, s.label) for s in DutyStatus]
STOP_CHOICES = [(k.value, k.value.replace("_", " ").title()) for k in StopKind]


class Trip(models.Model):
    # --- inputs (the brief's four, plus what the log sheet header needs) ----- #
    current_location = models.CharField(max_length=255)
    pickup_location = models.CharField(max_length=255)
    dropoff_location = models.CharField(max_length=255)
    current_cycle_used = models.FloatField(
        help_text="Recap box C: on-duty hours in the last 8 days including today"
    )
    start_datetime = models.DateTimeField()
    timezone = models.CharField(max_length=64, default="America/Chicago")
    allow_sleeper_split = models.BooleanField(default=False)

    # --- log sheet header fields -------------------------------------------- #
    driver_name = models.CharField(max_length=120, blank=True)
    co_driver_name = models.CharField(max_length=120, blank=True)
    carrier_name = models.CharField(max_length=200, blank=True)
    main_office_address = models.CharField(max_length=255, blank=True)
    home_terminal_address = models.CharField(max_length=255, blank=True)
    truck_number = models.CharField(max_length=60, blank=True)
    trailer_number = models.CharField(max_length=60, blank=True)
    shipper_commodity = models.CharField(max_length=255, blank=True)
    shipping_doc_no = models.CharField(max_length=60, blank=True)

    # --- resolved coordinates ----------------------------------------------- #
    origin_lat = models.FloatField(null=True)
    origin_lng = models.FloatField(null=True)
    pickup_lat = models.FloatField(null=True)
    pickup_lng = models.FloatField(null=True)
    dropoff_lat = models.FloatField(null=True)
    dropoff_lng = models.FloatField(null=True)

    # --- results ------------------------------------------------------------ #
    total_miles = models.FloatField(default=0)
    drive_hours = models.FloatField(default=0)
    on_duty_hours = models.FloatField(default=0)
    elapsed_hours = models.FloatField(default=0)
    arrival_datetime = models.DateTimeField(null=True)
    cycle_used_end = models.FloatField(default=0)

    route_geometry = models.JSONField(default=list, help_text="Simplified [[lat, lng], ...]")
    routing_provider = models.CharField(max_length=60, blank=True)
    is_compliant = models.BooleanField(default=True)
    violations = models.JSONField(default=list)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.current_location} -> {self.pickup_location} -> {self.dropoff_location}"


class RouteLeg(models.Model):
    trip = models.ForeignKey(Trip, related_name="legs", on_delete=models.CASCADE)
    sequence = models.PositiveSmallIntegerField()
    kind = models.CharField(max_length=20)  # to_pickup | to_dropoff
    origin_lat = models.FloatField()
    origin_lng = models.FloatField()
    dest_lat = models.FloatField()
    dest_lng = models.FloatField()
    distance_mi = models.FloatField()
    duration_hr = models.FloatField()

    class Meta:
        ordering = ["sequence"]


class Step(models.Model):
    """A turn-by-turn instruction.

    The brief's Objective line asks the app to output "route instructions", which
    the Outputs bullets never restate — easy to miss, and a literal miss if
    skipped. `mile_marker` shares an axis with Stop, so the UI merges the two
    lists with one sort.
    """

    trip = models.ForeignKey(Trip, related_name="steps", on_delete=models.CASCADE)
    sequence = models.PositiveIntegerField()
    instruction = models.TextField()
    distance_mi = models.FloatField()
    duration_hr = models.FloatField()
    mile_marker = models.FloatField()

    class Meta:
        ordering = ["sequence"]


class Stop(models.Model):
    """Somewhere the truck stops — a map pin and an itinerary row."""

    trip = models.ForeignKey(Trip, related_name="stops", on_delete=models.CASCADE)
    sequence = models.PositiveIntegerField()
    kind = models.CharField(max_length=20, choices=STOP_CHOICES)
    status = models.CharField(max_length=4, choices=DUTY_CHOICES)
    label = models.CharField(max_length=120)
    location = models.CharField(max_length=200, blank=True)
    lat = models.FloatField(null=True)
    lng = models.FloatField(null=True)
    arrive_at = models.DateTimeField()
    depart_at = models.DateTimeField()
    duration_hr = models.FloatField()
    mile_marker = models.FloatField()

    class Meta:
        ordering = ["sequence"]


class LogDay(models.Model):
    """One Driver's Daily Log sheet."""

    trip = models.ForeignKey(Trip, related_name="log_days", on_delete=models.CASCADE)
    day_index = models.PositiveSmallIntegerField()
    date = models.DateField()

    total_off = models.FloatField(default=0)
    total_sb = models.FloatField(default=0)
    total_driving = models.FloatField(default=0)
    total_on_duty = models.FloatField(default=0)
    miles_driving_today = models.FloatField(default=0)

    # Recap band. Semantics derived from § 395.3(b) — see apps/hos/recap.py.
    recap_on_duty_today = models.FloatField(default=0)
    recap_last_7_days = models.FloatField(default=0)  # box A
    recap_available_tomorrow = models.FloatField(default=0)  # box B = 70 - A
    recap_last_8_days = models.FloatField(default=0)  # box C

    is_partial = models.BooleanField(default=False)

    class Meta:
        ordering = ["day_index"]

    @property
    def total_hours(self) -> float:
        return round(self.total_off + self.total_sb + self.total_driving + self.total_on_duty, 2)


class DutySegment(models.Model):
    """One horizontal run on the graph grid, in minutes past the sheet's start."""

    log_day = models.ForeignKey(LogDay, related_name="segments", on_delete=models.CASCADE)
    status = models.CharField(max_length=4, choices=DUTY_CHOICES)
    start_minute = models.PositiveSmallIntegerField()
    end_minute = models.PositiveSmallIntegerField()
    note = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["start_minute"]


class LogRemark(models.Model):
    """A Remarks-band entry: where a change of duty status happened. Guide p.17."""

    log_day = models.ForeignKey(LogDay, related_name="remark_entries", on_delete=models.CASCADE)
    minute = models.PositiveSmallIntegerField()
    location = models.CharField(max_length=200)
    note = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["minute"]
