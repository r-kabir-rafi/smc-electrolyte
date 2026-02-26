.PHONY: setup up down logs test lint fmt

setup:
	docker compose up --build

up:
	docker compose up --build -d

down:
	docker compose down -v

logs:
	docker compose logs -f --tail=200

test:
	docker compose run --rm backend pytest -q

lint:
	docker compose run --rm backend ruff check .
	docker compose run --rm frontend npm run lint

fmt:
	docker compose run --rm backend ruff format .
