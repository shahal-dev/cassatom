# CASSA — Runbook (get it operational, step by step)

Everything we've built so far (Phases 0–1 + runtime device connection), driving
your **real instruments** over INDI. Devices are discovered by **Scan** and bound
to roles from the console — no hardcoded device map, any INDI-supported brand.

### Two machines (who does what)

CASSA runs across **two roles**. They can be the same physical box (everything on
one Linux machine next to the telescope) or two boxes on the same network — the
steps below tell you which role each command belongs to.

| Role | What it is | Runs here | Installs needed |
|------|-----------|-----------|-----------------|
| 🛰️ **EDGE NODE** | The Linux box **physically cabled to the instruments** (mount, cameras, focuser, wheel) | the **INDI server** (`indiserver` + your real drivers) | `indi-full` + vendor driver pkgs (step **1c**) |
| 💻 **WORKSTATION** | Where you sit and operate from (laptop/desktop) | the **backend API** + the **web console** | Python venv + CASSA (step **1a**), Node + web deps (step **1b**) |

> **Single-machine setup?** If the instruments are plugged straight into your
> workstation, that one box is *both* roles — run **all** steps on it and use
> `localhost` for the INDI host.

The two talk over TCP: the workstation's backend connects to the edge node's INDI
server on **port 7624**. Open that port between them (or run WireGuard/VPN for a
remote site).

| Component | Role | Port | URL |
|-----------|------|------|-----|
| Web console | 💻 workstation | 5173 | http://localhost:5173 |
| Backend API | 💻 workstation | 8000 | http://localhost:8000 |
| INDI server | 🛰️ edge node | 7624 | (tcp) |
| SFTP gateway (optional) | 💻 workstation | 2022 / 8082 | sftp://localhost:2022 · http://localhost:8082 |

---

## 0. Prerequisites (check once)

**💻 WORKSTATION** — for the backend + console:
```bash
python3 --version     # need 3.11+   (you have 3.12)
node --version        # need 18+     (you have v24)
```

**🛰️ EDGE NODE** — for the instruments: you need `indiserver` plus the vendor
driver packages for your hardware (installed in step **1c**).

---

## 1. One-time setup

### 1a. Python backend &nbsp;— 💻 WORKSTATION
```bash
cd ~/Desktop/cassa

# create + activate a virtualenv (reuse your existing .cassatom if you have it)
python3 -m venv .venv
source .venv/bin/activate
#   (if reusing the one you already made:  source .cassatom/bin/activate )

# install CASSA and its dependencies
pip install --upgrade pip
pip install -e .
```

### 1b. Web console &nbsp;— 💻 WORKSTATION
```bash
cd ~/Desktop/cassa/web
npm install
cd ..
```

### 1c. INDI drivers &nbsp;— 🛰️ EDGE NODE
Install INDI and the driver packages for your instruments on the box the hardware
is cabled to. The full driver set covers most mounts, cameras, focusers and filter
wheels across brands:
```bash
sudo add-apt-repository ppa:mutlaqja/ppa
sudo apt update
sudo apt install -y indi-full          # all INDI device drivers
sudo usermod -aG dialout $USER         # serial permission — then log out / back in
```
> If `add-apt-repository` is unavailable, enable universe first:
> `sudo add-apt-repository universe && sudo apt update`.

---

## 2. Run it (3 terminals)

> Terminal 1 is on the **🛰️ edge node**; Terminals 2 & 3 are on the **💻
> workstation**. On a single-machine setup all three are just three terminals on
> that one box.

### Terminal 1 &nbsp;— 🛰️ EDGE NODE — INDI server

Cable up first: serial mounts via **EQDIR/USB-serial** (bypass any handset),
cameras/focusers/wheels via **USB**. Then start `indiserver` with the drivers for
**your** hardware, e.g.:
```bash
indiserver -v indi_eqmod indi_toupbase indi_asi_ccd indi_asi_focuser
#            └ list the drivers for the devices you actually have
```
Leave it running. If you're not sure which drivers match your gear, the KStars/Ekos
"Profile Editor" lists driver names by brand — use those names here.

### Terminal 2 &nbsp;— 💻 WORKSTATION — backend API
```bash
cd ~/Desktop/cassa
source .venv/bin/activate         # or: source .cassatom/bin/activate

# point CASSA at the edge node's INDI server.
# single-machine setup? skip these two lines — localhost:7624 is the default.
export CASSA_INDI_HOST=192.168.1.50      # the edge node's address
export CASSA_INDI_PORT=7624

uvicorn cassa.core.app:app --reload --host 0.0.0.0 --port 8000
```
You should see `CASSA core ready — INDI <host>:7624` and `INDI transport up`.
(On first run it creates `data/` with the SQLite archive.) You can also leave the
host unset and set it later from the console (**Connect server**).

### Terminal 3 &nbsp;— 💻 WORKSTATION — web console
```bash
cd ~/Desktop/cassa/web
npm run dev
```
Open the printed URL: **http://localhost:5173**

---

## 3. Drive it from the console &nbsp;— 💻 WORKSTATION (browser)

1. Top of the page shows **INDI connected**. If it shows the wrong server, set the
   **INDI host/port** to the edge node and click **Connect server**.
2. In the **Devices** panel: click **Scan** — every device your INDI server exposes
   appears, with its detected role(s).
3. **Auto-detect & connect all** binds each device to its primary role, or assign
   roles manually. For a **serial mount**, type its port (e.g. `/dev/ttyUSB0`, or a
   stable `/dev/serial/by-id/...` path) in its row before clicking **Connect**.
4. **Mount** panel: enter RA/Dec, click **Slew**, watch it converge; toggle
   tracking, park/unpark.
5. **Focuser & Filter** panel: move the focuser, pick a filter.
6. **Camera** panel: set an Object name + exposure, click **Capture & archive**.
7. The frame appears in the **Archive** grid with a working **FITS ↓** download link.

That's the full Phase-0/1 milestone: connect → slew → capture → provenance FITS →
archive → download. Your selections persist to `data/bindings.json` and reconnect
automatically on restart.

---

## 4. Verify from the command line (optional) &nbsp;— 💻 WORKSTATION
```bash
curl localhost:8000/api/health
curl localhost:8000/api/indi/devices            # discovered devices
curl -X POST localhost:8000/api/devices/autodetect
curl -X POST localhost:8000/api/camera/capture \
  -H 'content-type: application/json' \
  -d '{"seconds":2,"object_name":"M42","image_type":"LIGHT"}'
curl "localhost:8000/api/images?limit=5"        # archive index
```

---

## 5. Retrieve images over SFTP/FTP (optional, needs Docker) &nbsp;— 💻 WORKSTATION
```bash
docker compose -f deploy/docker-compose.yml --profile ftp up -d
# open http://localhost:8082  (admin / cassa-admin), create an SFTP user whose
# home folder maps to /srv/archive, then:
sftp -P 2022 <user>@localhost      # browse raw/  previews/  thumbs/
```

---

## 6. Stop / restart

- Stop the web console / backend: `Ctrl-C` in their terminals.
- Stop the `indiserver` on the edge node: `Ctrl-C` in Terminal 1.
- Stop the SFTP gateway: `docker compose -f deploy/docker-compose.yml --profile ftp down`.
- Restart later: repeat **step 2**. Bindings + archive persist in `data/`.

---

## 7. Troubleshooting

| Symptom | Fix |
|--------|-----|
| Console shows **INDI down** | Edge node's `indiserver` not running, or wrong host/port — start it, set the host/port, then **Scan**. |
| Devices panel empty after Scan | INDI server has no drivers loaded — check Terminal 1 lists the drivers for your hardware. |
| A device is missing after Scan | its driver isn't in the `indiserver` command, or the USB/serial cable isn't enumerated — check `lsusb` / `ls -l /dev/serial/by-id/`. |
| Real mount won't connect | wrong serial port or no `dialout` group — set the port in its row; confirm `ls -l /dev/serial/by-id/`; re-login after `usermod`. |
| `503 mount not connected` on slew/capture | bind the device first (Devices panel). |
| Backend import errors after `git pull` | dependencies changed — `pip install -e .` again. |
| Port already in use (8000/5173/7624) | stop the old process, or change the port (`uvicorn ... --port 8001`, etc.). |

---

## 8. Quick reference (Makefile)
```
make install     # pip install -e .  +  web npm install
make backend     # run the API (http://localhost:8000)
make web         # run the console (http://localhost:5173)
make infra       # postgres/redis/nats/minio (later phases)
```
The INDI server runs on the edge node with your real drivers (step 2, Terminal 1);
point `CASSA_INDI_HOST`/`CASSA_INDI_PORT` at it or set it from the console.
