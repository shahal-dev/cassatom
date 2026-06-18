#!/usr/bin/env bash
# Run the CIAO site backend (second observatory) on port 8001.
#
# Each location is its own backend + INDI server + config. This launches CIAO with
# its own observatory file, DB and device bindings so it never collides with the
# IUB Rooftop backend (port 8000). For a real deployment this runs on CIAO's own
# edge node (Pi / mini-PC) in Kaliakair, next to its INDI server.
#
# IMPORTANT: set the SAME CASSA_AUTH_SECRET as the other site (in .env or here) so
# one login works across both observatories.
set -euo pipefail
cd "$(dirname "$0")"
source .cassatom/bin/activate 2>/dev/null || true

export CASSA_OBSERVATORY_FILE="observatory-ciao.yaml"
export CASSA_DB_URL="sqlite+aiosqlite:///data/ciao.db"
export CASSA_BINDINGS_PATH="data/ciao_bindings.json"
export CASSA_INDI_HOST="${CASSA_INDI_HOST:-localhost}"
export CASSA_INDI_PORT="${CASSA_INDI_PORT:-7625}"   # CIAO's own INDI server

exec uvicorn cassa.core.app:app --host 0.0.0.0 --port 8001
