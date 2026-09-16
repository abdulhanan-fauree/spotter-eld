"""Mapping domain errors onto HTTP.

Views should describe *what* they return, not translate exception types. Anything
raised out of the service layer lands here instead of in a `try/except` around
every call site.
"""

from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from .services import PlanningError

log = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    """DRF `EXCEPTION_HANDLER`.

    `PlanningError` means the *input* could not be planned — a bad address, an
    unroutable pair — so it is 422 and the UI shows it against the form, not a
    500 that reads as our fault.
    """
    if isinstance(exc, PlanningError):
        return Response({"detail": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

    response = drf_exception_handler(exc, context)
    if response is None:
        # Genuinely unexpected: log the traceback, tell the client nothing useful.
        log.exception("unhandled error in %s", context.get("view"))
        return Response(
            {"detail": "Unable to complete the request. Please try again."},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    return response
