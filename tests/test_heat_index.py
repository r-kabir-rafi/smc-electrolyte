"""Tests for Rothfusz heat index calculations."""

import pytest

from app.services.heat_features import rothfusz_heat_index_c


def test_heat_index_matches_reference_pairs() -> None:
    """Known heat-index reference pairs should be within tolerance."""

    reference_cases = [
        (30.0, 70.0, 35.04),
        (35.0, 60.0, 45.05),
        (40.0, 40.0, 48.27),
    ]

    for temperature_c, rh, expected_hi_c in reference_cases:
        actual = rothfusz_heat_index_c(temperature_c, rh)
        assert actual == pytest.approx(expected_hi_c, abs=0.5)


def test_heat_index_returns_air_temperature_when_outside_regression_domain() -> None:
    """Cooler or drier conditions should fall back to air temperature."""

    assert rothfusz_heat_index_c(25.0, 50.0) == pytest.approx(25.0, abs=1e-6)
    assert rothfusz_heat_index_c(32.0, 35.0) == pytest.approx(32.0, abs=1e-6)
