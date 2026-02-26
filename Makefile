.PHONY: setup dev backend-install frontend-install backend-dev frontend-dev test lint fmt

setup: backend-install frontend-install

backend-install:
	python3 -m venv .venv
	. .venv/bin/activate && pip install --upgrade pip && pip install -e ./backend[dev]

frontend-install:
	npm --prefix frontend install

dev:
	@echo "Run 'make backend-dev' and 'make frontend-dev' in separate terminals."

backend-dev:
	. .venv/bin/activate && uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload

frontend-dev:
	cd frontend && npm run dev

test:
	. .venv/bin/activate && pytest -q backend/tests

lint:
	. .venv/bin/activate && ruff check backend
	cd frontend && npm run lint

fmt:
	. .venv/bin/activate && ruff format backend
