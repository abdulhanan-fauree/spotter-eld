"""Serializers. Thin, because the models were shaped for the UI."""

from __future__ import annotations

from rest_framework import serializers

from .models import DutySegment, LogDay, LogRemark, RouteLeg, Step, Stop, Trip


class TripInputSerializer(serializers.Serializer):
    """The brief's four inputs, plus optional log-sheet header fields."""

    current_location = serializers.CharField(max_length=255)
    pickup_location = serializers.CharField(max_length=255)
    dropoff_location = serializers.CharField(max_length=255)
    current_cycle_used = serializers.FloatField(min_value=0, max_value=70)

    start_datetime = serializers.DateTimeField(required=False, allow_null=True)
    timezone = serializers.CharField(required=False, allow_blank=True, max_length=64)
    allow_sleeper_split = serializers.BooleanField(required=False, default=False)

    driver_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    co_driver_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    carrier_name = serializers.CharField(required=False, allow_blank=True, max_length=200)
    main_office_address = serializers.CharField(required=False, allow_blank=True, max_length=255)
    home_terminal_address = serializers.CharField(required=False, allow_blank=True, max_length=255)
    truck_number = serializers.CharField(required=False, allow_blank=True, max_length=60)
    trailer_number = serializers.CharField(required=False, allow_blank=True, max_length=60)
    shipper_commodity = serializers.CharField(required=False, allow_blank=True, max_length=255)
    shipping_doc_no = serializers.CharField(required=False, allow_blank=True, max_length=60)

    def validate(self, attrs):
        if attrs["pickup_location"].strip().lower() == attrs["dropoff_location"].strip().lower():
            raise serializers.ValidationError(
                {"dropoff_location": "Pickup and dropoff must be different locations."}
            )
        return attrs


class DutySegmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DutySegment
        fields = ["status", "start_minute", "end_minute", "note"]


class LogRemarkSerializer(serializers.ModelSerializer):
    class Meta:
        model = LogRemark
        fields = ["minute", "location", "note"]


class LogDaySerializer(serializers.ModelSerializer):
    segments = DutySegmentSerializer(many=True, read_only=True)
    remarks = LogRemarkSerializer(source="remark_entries", many=True, read_only=True)
    totals = serializers.SerializerMethodField()
    recap = serializers.SerializerMethodField()
    total_hours = serializers.FloatField(read_only=True)

    class Meta:
        model = LogDay
        fields = [
            "day_index", "date", "totals", "total_hours",
            "miles_driving_today", "segments", "remarks", "recap", "is_partial",
        ]

    def get_totals(self, obj) -> dict:
        return {
            "OFF": obj.total_off,
            "SB": obj.total_sb,
            "D": obj.total_driving,
            "ON": obj.total_on_duty,
        }

    def get_recap(self, obj) -> dict:
        return {
            "on_duty_today": obj.recap_on_duty_today,
            "total_last_7_days": obj.recap_last_7_days,
            "available_tomorrow": obj.recap_available_tomorrow,
            "total_last_8_days": obj.recap_last_8_days,
        }


class StopSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stop
        fields = [
            "sequence", "kind", "status", "label", "location",
            "lat", "lng", "arrive_at", "depart_at", "duration_hr", "mile_marker",
        ]


class StepSerializer(serializers.ModelSerializer):
    class Meta:
        model = Step
        fields = ["sequence", "instruction", "distance_mi", "duration_hr", "mile_marker"]


class RouteLegSerializer(serializers.ModelSerializer):
    class Meta:
        model = RouteLeg
        fields = [
            "sequence", "kind", "origin_lat", "origin_lng",
            "dest_lat", "dest_lng", "distance_mi", "duration_hr",
        ]


class TripListSerializer(serializers.ModelSerializer):
    log_sheet_count = serializers.IntegerField(source="log_days.count", read_only=True)

    class Meta:
        model = Trip
        fields = [
            "id", "current_location", "pickup_location", "dropoff_location",
            "current_cycle_used", "total_miles", "drive_hours", "elapsed_hours",
            "arrival_datetime", "is_compliant", "log_sheet_count", "created_at",
        ]


class TripDetailSerializer(serializers.ModelSerializer):
    legs = RouteLegSerializer(many=True, read_only=True)
    stops = StopSerializer(many=True, read_only=True)
    steps = StepSerializer(many=True, read_only=True)
    log_days = LogDaySerializer(many=True, read_only=True)
    summary = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = [
            "id", "created_at",
            # inputs
            "current_location", "pickup_location", "dropoff_location",
            "current_cycle_used", "start_datetime", "timezone", "allow_sleeper_split",
            # log sheet header
            "driver_name", "co_driver_name", "carrier_name", "main_office_address",
            "home_terminal_address", "truck_number", "trailer_number",
            "shipper_commodity", "shipping_doc_no",
            # geo
            "origin_lat", "origin_lng", "pickup_lat", "pickup_lng",
            "dropoff_lat", "dropoff_lng", "route_geometry", "routing_provider",
            # results
            "summary", "is_compliant", "violations",
            "legs", "stops", "steps", "log_days",
        ]

    def get_summary(self, obj) -> dict:
        return {
            "total_miles": obj.total_miles,
            "drive_hours": obj.drive_hours,
            "on_duty_hours": obj.on_duty_hours,
            "elapsed_hours": obj.elapsed_hours,
            "arrival_datetime": obj.arrival_datetime,
            "cycle_used_start": obj.current_cycle_used,
            "cycle_used_end": obj.cycle_used_end,
            "log_sheet_count": obj.log_days.count(),
        }


class PlaceSerializer(serializers.Serializer):
    name = serializers.CharField()
    lat = serializers.FloatField()
    lng = serializers.FloatField()
    city_state = serializers.CharField(allow_blank=True)
