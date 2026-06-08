.PHONY: help install indi indi-stop backend web infra logs

help:
	@echo "CASSA Phase 0 — targets:"
	@echo "  make install   install python deps (-e .) and web deps"
	@echo "  make indi       start the INDI simulator (docker, port 7624)"
	@echo "  make backend    run the FastAPI core   -> http://localhost:8000"
	@echo "  make web        run the web console     -> http://localhost:5173"
	@echo "  make infra      start postgres/redis/nats/minio (later phases)"
	@echo "  make indi-stop  stop docker services"

install:
	pip install -e .
	cd web && npm install

indi:
	docker compose -f deploy/docker-compose.yml up -d --build indi-sim

indi-stop:
	docker compose -f deploy/docker-compose.yml down

logs:
	docker compose -f deploy/docker-compose.yml logs -f indi-sim

backend:
	uvicorn cassa.core.app:app --reload --host 0.0.0.0 --port 8000

web:
	cd web && npm run dev

infra:
	docker compose -f deploy/docker-compose.yml --profile infra up -d
