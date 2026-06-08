# CASSA — Runbook (get it operational, step by step)

Everything we've built so far (Phases 0–1 + runtime device connection), running on
**one Linux machine** against the **INDI simulators** — then the one-line switch to
your real EQ6-R + ToupTek rig.

You will run **3 things**: an **INDI server**, the **backend API**, and the **web
console**. Use three terminals.

| Component | Port | URL |
|-----------|------|-----|
| Web console | 5173 | http://localhost:5173 |
| Backend API | 8000 | http://localhost:8000 |
| INDI server | 7624 | (tcp) |
| SFTP gateway (optional) | 2022 / 8082 | sftp://localhost:2022 · http://localhost:8082 |

---

## 0. Prerequisites (check once)

```bash
python3 --version     # need 3.11+   (you have 3.12)
node --version        # need 18+     (you have v24)
```

Pick how you'll run the **INDI simulator** — either is fine:
- **A. Local INDI** (recommended here; no Docker needed)
- **B. Docker** (only if your Docker daemon is running)

---

## 1. One-time setup

### 1a. Python backend
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

### 1b. Web console
```bash
cd ~/Desktop/cassa/web
npm install
cd ..
```

### 1c. INDI server — choose A or B

**A. Local INDI (no Docker)** — install the INDI binaries + simulator drivers:
```bash
sudo apt update
sudo apt install -y indi-bin
# verify the simulator drivers exist:
which indi_simulator_telescope indi_simulator_ccd
```
> If `indi-bin` isn't found, enable the universe repo first:
> `sudo add-apt-repository universe && sudo apt update`, then re-run the install.

**B. Docker** — nothing to install now; you'll build the sim image in step 2.

---

## 2. Run it (3 terminals)

### Terminal 1 — INDI server

**A. Local:**
```bash
indiserver -v indi_simulator_telescope indi_simulator_ccd \
              indi_simulator_focus indi_simulator_wheel
```

**B. Docker:**
```bash
cd ~/Desktop/cassa
make indi          # builds + runs the sim image on :7624
# logs:  make logs        stop later:  make indi-stop
```

Leave it running. It now serves a simulated mount, camera, focuser and filter wheel
on port 7624.

### Terminal 2 — backend API
```bash
cd ~/Desktop/cassa
source .venv/bin/activate         # or: source .cassatom/bin/activate
uvicorn cassa.core.app:app --reload --host 0.0.0.0 --port 8000
```
You should see `CASSA core ready — INDI localhost:7624` and
`INDI transport up`. (On first run it creates `data/` with the SQLite archive.)

### Terminal 3 — web console
```bash
cd ~/Desktop/cassa/web
npm run dev
```
Open the printed URL: **http://localhost:5173**

---

## 3. Drive it from the console

1. Top of the page shows **INDI connected**.
2. In the **Devices** panel: click **Scan**, then **Auto-detect & connect all**.
   The role chips fill in: `mount: Telescope Simulator`, `camera: CCD Simulator`,
   `focuser`, `filter`.
3. **Mount** panel: the default RA/Dec points near Orion — click **Slew** and watch
   RA/Dec converge; toggle tracking, park/unpark.
4. **Focuser & Filter** panel: move the focuser, pick a filter.
5. **Camera** panel: set an Object name + exposure, click **Capture & archive**.
6. The frame appears in the **Archive** grid with a working **FITS ↓** download link.

That's the full Phase-0/1 milestone: connect → slew → capture → provenance FITS →
archive → download.

---

## 4. Verify from the command line (optional)
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

## 5. Retrieve images over SFTP/FTP (optional, needs Docker)
```bash
docker compose -f deploy/docker-compose.yml --profile ftp up -d
# open http://localhost:8082  (admin / cassa-admin), create an SFTP user whose
# home folder maps to /srv/archive, then:
sftp -P 2022 <user>@localhost      # browse raw/  previews/  thumbs/
```

---

## 6. Switch to REAL hardware (EQ6-R + ToupTek)

No code or config-file change — only the INDI server and the Devices panel.

### 6a. Install real drivers (once)
```bash
sudo add-apt-repository ppa:mutlaqja/ppa
sudo apt update
sudo apt install -y indi-full          # includes indi_eqmod + indi_toupbase
sudo usermod -aG dialout $USER         # serial permission — then log out / back in
```

### 6b. Cable up
- EQ6-R via **EQDIR/USB-serial** (bypass the SynScan handset).
- ToupTek Minicam8 / AAF / guide cam via **USB 3.0**.

### 6c. Run the real drivers (Terminal 1, instead of the simulators)
```bash
indiserver -v indi_eqmod indi_toupbase
```

### 6d. Connect from the console
1. **Devices → Scan** — your real device names appear (e.g. `EQMod Mount`,
   `Toupcam ...`).
2. On the `EQMod Mount` row, type the serial port (e.g. `/dev/ttyUSB0` — or a stable
   `/dev/serial/by-id/...` path), pick role **mount**, click **Connect**.
3. Assign the cameras/focuser and **Connect** (or use **Auto-detect & connect all**).

Your selections are saved to `data/bindings.json` and reconnect automatically.

> **Remote site?** Run the INDI server on the edge node and, in the Devices panel,
> set **INDI host/port** to that node's address and click **Connect server**.

---

## 7. Stop / restart

- Stop the web console / backend: `Ctrl-C` in their terminals.
- Stop a local `indiserver`: `Ctrl-C` in Terminal 1.
- Stop Docker services: `make indi-stop` (and `docker compose -f deploy/docker-compose.yml --profile ftp down`).
- Restart later: repeat **step 2**. Bindings + archive persist in `data/`.

---

## 8. Troubleshooting

| Symptom | Fix |
|--------|-----|
| Console shows **INDI down** | Terminal 1 not running, or wrong host/port — start `indiserver`, then **Scan**. |
| `indi-bin: command not found` on install | enable universe: `sudo add-apt-repository universe && sudo apt update`. |
| Devices panel empty after Scan | INDI server has no drivers loaded — check Terminal 1 lists the drivers. |
| Real mount won't connect | wrong serial port or no `dialout` group — set the port in its row; confirm `ls -l /dev/serial/by-id/`; re-login after `usermod`. |
| `503 mount not connected` on slew/capture | bind the device first (Devices panel). |
| Backend import errors after `git pull` | dependencies changed — `pip install -e .` again. |
| Port already in use (8000/5173/7624) | stop the old process, or change the port (`uvicorn ... --port 8001`, etc.). |

---

## 9. Quick reference (Makefile)
```
make install     # pip install -e .  +  web npm install
make indi        # start INDI simulator via Docker
make backend     # run the API (http://localhost:8000)
make web         # run the console (http://localhost:5173)
make infra       # postgres/redis/nats/minio (later phases)
make indi-stop   # stop Docker services
```
