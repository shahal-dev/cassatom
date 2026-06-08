# CASSA — Phase 0

Multi-site telescope/dome control system. **Phase 0** is the foundation + a fully
**simulated telescope** you can drive by hand from a browser — no real hardware.

The full design lives in [`docs/plan/`](docs/plan/README.md). This README is the
runnable Phase-0 slice.

## What works in Phase 0

- A pure-Python **async INDI client** (`cassa/dal/indi/protocol.py`) — same code path
  for the simulators and, later, the real EQ6-R (`indi_eqmod`) + ToupTek (`indi_toupbase`).
- **DAL roles**: `Mount`, `Camera` (`cassa/dal/`).
- **Site Agent** (`cassa/agent/`) with a resilient INDI connection + camera previews.
- **Core API** (`cassa/core/`): REST manual control + a WebSocket telemetry stream.
- **Web console** (`web/`): live RA/Dec, slew/park/abort, expose, and a FITS→PNG preview.

> **Milestone:** slew the simulated mount, take an exposure, and see the image +
> live RA/Dec update in the browser.

## Architecture (Phase 0)

```
 Browser (React)  ──HTTP/WS──▶  Core API (FastAPI)
                                   │  in-process
                                   ▼
                              Site Agent / DeviceManager
                                   │  async INDI (XML, TCP 7624)
                                   ▼
                              indiserver  (simulator drivers)
```

Agent + Core run in **one process** for Phase 0 (modular monolith). The NATS message
bus that separates them arrives in Phase 5 when there's a real remote site.

## Prerequisites

- Python 3.11+
- Node 18+ (for the web console)
- Docker (easiest way to run the INDI simulator) **or** a local `indiserver`

## Run it (3 terminals)

### 1. Start the INDI simulator
```bash
make indi                 # docker: builds & runs indiserver on :7624
# — or, with INDI installed locally (sudo apt install indi-bin):
indiserver -v indi_simulator_telescope indi_simulator_ccd
```

### 2. Start the core API
```bash
python -m venv .venv && source .venv/bin/activate
pip install -e .          # or: pip install -r requirements.txt
make backend              # uvicorn on http://localhost:8000
```

### 3. Start the web console
```bash
cd web && npm install
npm run dev               # http://localhost:5173
```

Open **http://localhost:5173**. You should see `live` + `INDI connected`. Enter an
RA/Dec (defaults point near Orion's Belt), click **Slew** and watch RA/Dec converge;
set an exposure and click **Expose** to get a simulated frame.

> Order doesn't matter — the backend retries the INDI connection, and the console
> reconnects the WebSocket automatically.

## Quick API check (no browser)
```bash
curl localhost:8000/api/status
curl -X POST localhost:8000/api/mount/slew \
  -H 'content-type: application/json' \
  -d '{"ra_hours": 5.59, "dec_deg": -5.39, "track": true}'
curl -X POST localhost:8000/api/camera/expose \
  -H 'content-type: application/json' -d '{"seconds": 2}'
curl localhost:8000/api/camera/last-image.png -o frame.png
```

## Cutover to real hardware (Phase 1)

No code change — edit [`sites/virtual.yaml`](sites/virtual.yaml): point `indi.host`
at the edge node and set the real device names (`EQMod Mount`, the ToupTek device
name). Run the real drivers on the edge node instead of the simulators. See the
**bring-up checklist** in [`docs/plan/11-ROADMAP.md`](docs/plan/11-ROADMAP.md).

## Layout
```
cassa/
  dal/        device abstraction layer (roles, INDI client, INDI adapter, imaging)
  agent/      site agent (device manager)
  core/       FastAPI app + config
web/          React + TypeScript console
deploy/       docker-compose + INDI simulator image
sites/        site config (virtual.yaml)
docs/plan/    full system design
```
