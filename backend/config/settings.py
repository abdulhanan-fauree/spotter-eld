"""Django settings. Deliberately small — this project is a JSON API, not a site."""

from __future__ import annotations

import os
import urllib.parse
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-not-for-production")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "apps.geo.apps.GeoConfig",
    "apps.trips.apps.TripsConfig",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# Vercel injects DATABASE_URL when a Postgres integration is attached to the
# project. Serverless functions get a read-only filesystem apart from /tmp, and
# /tmp is per-instance, so SQLite cannot be the production database here: a trip
# written by the instance handling the POST is invisible to whichever instance
# serves the follow-up GET. Locally, with DATABASE_URL unset, SQLite stays the
# zero-setup default and nothing about dev changes.
DATABASE_URL = os.environ.get("DATABASE_URL", "")

if DATABASE_URL:
    _db = urllib.parse.urlparse(DATABASE_URL)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": _db.path.lstrip("/"),
            # Credentials arrive percent-encoded in a URL; Postgres wants them raw.
            "USER": urllib.parse.unquote(_db.username or ""),
            "PASSWORD": urllib.parse.unquote(_db.password or ""),
            "HOST": _db.hostname or "",
            "PORT": _db.port or "",
            # Reuse the connection across requests that land on the same warm
            # instance. A fresh TCP + TLS handshake to Postgres on every request
            # is the largest avoidable latency in serverless Django.
            "CONN_MAX_AGE": 600,
            "OPTIONS": {"sslmode": "require"},
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
            "OPTIONS": {
                # The three location fields autocomplete concurrently, and each hit
                # writes to the geo cache. With SQLite's default rollback journal and
                # no busy timeout that is enough contention to raise "database is
                # locked" and 500 the request. WAL lets readers and a writer coexist;
                # the timeout makes competing writers wait rather than fail.
                "init_command": "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;",
                "timeout": 20,
            },
        }
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
TIME_ZONE = "UTC"
STATIC_URL = "static/"

CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = [
    o for o in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",") if o
]

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "UNAUTHENTICATED_USER": None,
    "EXCEPTION_HANDLER": "apps.trips.exceptions.api_exception_handler",
}

# --------------------------------------------------------------------------- #
# External geo services
# --------------------------------------------------------------------------- #

# OpenRouteService gives us the `driving-hgv` truck profile, which is the correct
# routing model for a CMV. It needs a free key. Without one we fall back to the
# public OSRM demo server, which needs no key but only models a car.
ORS_API_KEY = os.environ.get("ORS_API_KEY", "")

# Nominatim's usage policy requires a genuine identifying User-Agent.
GEO_USER_AGENT = os.environ.get(
    "GEO_USER_AGENT", "spotter-eld-trip-planner (assessment project)"
)
GEO_TIMEOUT_SECONDS = float(os.environ.get("GEO_TIMEOUT_SECONDS", "12"))
GEO_CACHE_DAYS = int(os.environ.get("GEO_CACHE_DAYS", "30"))
