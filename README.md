# CASSA — Phases 0–1

Multi-site telescope/dome control system that drives **real instruments** over
INDI from a browser. Devices are discovered from the INDI server and bound to
roles at runtime — no hardcoded device map, any INDI-supported brand.

The full design lives in [`docs/plan/`](docs/plan/README.md). This README is the
runnable slice.

## What works

**Phase 0 — foundations & manual control**
- A pure-Python **async INDI client** (`cassa/dal/indi/protocol.py`) that speaks
  the INDI XML wire protocol directly — no pyindi-client / libindi build deps.
- **DAL roles**: `Mount`, `Camera`, `Focuser`, `FilterWheel` (`cassa/dal/`).
- **Site Agent** (`cassa/agent/`) with a resilient INDI connection + live previews.
- **Core API** + **web console**: live telemetry, slew/park/abort, expose.

**Phase 1 — imaging pipeline & archive**
- **Full-frame capture** that authors a provenance-rich **FITS** (OBSID, pointing,
  time, instrument, filter, focus + FITS `CHECKSUM`/`DATASUM` + SHA-256) — `cassa/agent/fits_writer.py`.
- **Archive**: local object store + SQLite index (`cassa/core/{storage,db,archive}.py`),
  auto previews + thumbnails.
- **Archive API + browser**: search recent frames, view thumbnails, **download FITS**.
- **Focuser + filter-wheel** manual control; filter recorded into FITS headers.
- **SFTP/FTP download gateway** (SFTPGo) over the archive for bulk retrieval.

> **Milestone:** capture a target on the camera → a provenance FITS lands
> in the archive → download it over HTTPS or SFTP.

## Architecture (Phase 0)

```
 Browser (React)  ──HTTP/WS──▶  Core API (FastAPI)
                                   │  in-process
                                   ▼
                              Site Agent / DeviceManager
                                   │  async INDI (XML, TCP 7624)
                                   ▼
                       indiserver  (real device drivers, edge node)
```

Agent + Core run in **one process** for Phase 0 (modular monolith). The NATS message
bus that separates them arrives in Phase 5 when there's a real remote site.

## Prerequisites

- Python 3.11+
- Node 18+ (for the web console)
- An `indiserver` running your real device drivers, reachable over TCP (port 7624).
  This usually runs on the **observatory edge node** next to the hardware.

## Run it (3 terminals)

### 1. Start the INDI server (on the edge node, with your real drivers)
```bash
# On the machine the instruments are wired to (sudo apt install indi-bin + the
# vendor driver packages), run indiserver with your device drivers, e.g.:
indiserver -v indi_eqmod indi_toupbase indi_asi_ccd   # whatever you have
```
Point CASSA at it with `CASSA_INDI_HOST`/`CASSA_INDI_PORT` (or set the host/port
from the console). If the instruments are on the same box, `localhost:7624` works.

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

Open **http://localhost:5173**. You should see `INDI connected`.

**Connect your devices from the console** (no YAML editing):
1. In the **Devices** panel, click **Scan** to list whatever the INDI server exposes.
2. Click **Auto-detect & connect all** — each device binds to its role (mount,
   camera, focuser, filter). Or assign roles manually and click **Connect**.
3. For a **real serial mount** (EQ6-R via EQDIR), type the port (e.g. `/dev/ttyUSB0`)
   in its row before connecting.
4. To point CASSA at a **remote edge node**, set the INDI host/port and click
   **Connect server**.

Your choices persist to `data/bindings.json` and reconnect automatically on restart.
Once bound, the Mount/Camera/Focuser panels go live: slew, capture, and archive.

> Order doesn't matter — the backend retries the INDI connection and the console
> reconnects the WebSocket automatically.

## Quick API check (no browser)
```bash
curl localhost:8000/api/status
curl -X POST localhost:8000/api/mount/slew \
  -H 'content-type: application/json' \
  -d '{"ra_hours": 5.59, "dec_deg": -5.39, "track": true}'
# capture a provenance FITS and archive it
curl -X POST localhost:8000/api/camera/capture \
  -H 'content-type: application/json' \
  -d '{"seconds": 2, "object_name": "M42", "image_type": "LIGHT"}'
# list the archive, then download a frame's FITS
curl localhost:8000/api/images?limit=5
curl -OJ localhost:8000/api/images/<image_id>/fits
```

## Retrieve images over SFTP/FTP
```bash
docker compose -f deploy/docker-compose.yml --profile ftp up -d
# open http://localhost:8082 (admin / cassa-admin), create an SFTP user whose
# home maps to /srv/archive, then:
sftp -P 2022 <user>@localhost      # browse raw/ previews/ thumbs/
```

## Multi-device / multi-brand notes

CASSA makes no assumptions about device brands. Whatever your `indiserver`
exposes shows up under **Scan**; assign each to a role and connect. Serial mounts
(e.g. EQ6-R via EQDIR) take a port like `/dev/ttyUSB0` in their row before
connecting. See the **bring-up checklist** in
[`docs/plan/11-ROADMAP.md`](docs/plan/11-ROADMAP.md).

## Layout
```
cassa/
  dal/        device abstraction layer (roles, INDI client, INDI adapter, imaging)
  agent/      site agent (device manager)
  core/       FastAPI app + config
web/          React + TypeScript console
deploy/       docker-compose (supporting infra + SFTP gateway)
docs/plan/    full system design
```
