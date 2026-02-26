#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Pick an interpreter with required local deps, regardless of active venv.
pick_python() {
  for py in "${PYTHON_BIN:-}" python3 /home/rafi/anaconda3/bin/python3; do
    if [[ -z "${py}" ]]; then
      continue
    fi
    if command -v "${py}" >/dev/null 2>&1; then
      if "${py}" - <<'PY' >/dev/null 2>&1
import numpy, pandas, geopandas, sklearn, statsmodels, tifffile
PY
      then
        echo "${py}"
        return 0
      fi
    fi
  done
  echo "ERROR: No python interpreter with required deps found." >&2
  echo "Hint: set PYTHON_BIN=/path/to/python and retry." >&2
  exit 1
}

PY_BIN="$(pick_python)"
echo "Using Python: ${PY_BIN}"

"${PY_BIN}" pipelines/etl_admin_boundaries.py --use-demo
"${PY_BIN}" pipelines/generate_demo_temperature.py
"${PY_BIN}" pipelines/etl_temperature.py
"${PY_BIN}" pipelines/build_heatwave_index.py
"${PY_BIN}" pipelines/build_heatwave_layers.py
"${PY_BIN}" pipelines/news_collect.py --demo --demo-count 520
"${PY_BIN}" pipelines/extract_heatstroke_incidents.py
"${PY_BIN}" pipelines/geocode_incidents.py
"${PY_BIN}" pipelines/build_incident_heatwave_panel.py
"${PY_BIN}" pipelines/run_incident_heatwave_analysis.py
"${PY_BIN}" pipelines/build_prediction_dataset.py
"${PY_BIN}" pipelines/train_heatwave_models.py
"${PY_BIN}" pipelines/generate_hotspot_forecasts.py
"${PY_BIN}" pipelines/build_population_exposure.py
"${PY_BIN}" pipelines/build_mobility_proxy.py
"${PY_BIN}" pipelines/build_smc_priority_index.py
"${PY_BIN}" pipelines/build_smc_activation_outputs.py

pytest -q \
  tests/test_phase4_extraction.py \
  tests/test_phase4_geocoding.py \
  tests/test_phase5_panel.py \
  tests/test_phase6_outputs.py \
  tests/test_phase7_outputs.py \
  tests/test_phase8_outputs.py

PYTHONPATH=/home/rafi/code/smc-electrolyte/.venv_validate/lib/python3.11/site-packages:${PYTHONPATH:-} \
  pytest -q tests/test_backend_handlers_offline.py

"${PY_BIN}" scripts/validate_requirements.py
