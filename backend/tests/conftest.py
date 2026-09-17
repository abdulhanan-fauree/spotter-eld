"""Suite-wide fixtures."""

import pytest


@pytest.fixture(autouse=True)
def _rate_limits_off(settings):
    """The suite plans far more than twenty trips a minute from one address.

    The one test that exercises throttling switches it back on for itself.
    """
    settings.API_THROTTLING = False
