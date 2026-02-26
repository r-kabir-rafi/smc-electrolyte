from pipelines.extract_heatstroke_incidents import (
    _certainty,
    _extract_first_int,
    _extract_location_text,
    _norm_digits,
    DEATH_PATTERNS,
    HOSPITAL_PATTERNS,
)


def test_extract_deaths_english() -> None:
    text = "At least 7 people died in Dhaka due to heatstroke."
    assert _extract_first_int(text, DEATH_PATTERNS) == 7


def test_extract_hospitalized_bangla_digits() -> None:
    text = _norm_digits("ঢাকায় ১২ জন হাসপাতালে ভর্তি হয়েছেন")
    assert _extract_first_int(text, HOSPITAL_PATTERNS) == 12


def test_extract_location() -> None:
    text = "Authorities confirmed 3 deaths in Chattogram after heat wave."
    assert "Chattogram" in _extract_location_text(text)


def test_certainty_suspected() -> None:
    text = "Officials reported suspected heatstroke death in the area"
    assert _certainty(text) == "suspected"
