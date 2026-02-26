"""Optional LLM-based extractor scaffold for heatstroke incident fields.

Requires an external LLM API client in production.
This script provides prompt loading and response parsing shape.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

PROMPT_PATH = Path("prompts/incident_extractor_prompt.txt")


def load_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def parse_model_response(text: str) -> dict[str, Any]:
    payload = json.loads(text)
    required = {
        "incident_id",
        "date_occurred",
        "date_published",
        "deaths",
        "hospitalized",
        "location_text_raw",
        "certainty",
        "source",
        "url",
        "headline",
    }
    missing = required - set(payload.keys())
    if missing:
        raise ValueError(f"Missing keys in model response: {sorted(missing)}")
    return payload


def main() -> None:
    prompt = load_prompt()
    print("Loaded prompt for LLM incident extraction")
    print(f"Prompt length: {len(prompt)} chars")


if __name__ == "__main__":
    main()
