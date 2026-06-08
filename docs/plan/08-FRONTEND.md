# 08 — Frontend & Real-time Operator Experience

The console is where operators get **full manual access to everything** and watch
execution live. It must be fast, unambiguous, and safe (no accidental dome-open).

## 1. Principles
- **Manual control is always one click away**, per device, for any site.
- **Live by default**: state streams in; the operator never hits "refresh".
- **Unmistakable status**: big, color-coded safety & connection banners.
- **Hard-to-misfire dangerous actions**: confirm dialogs / hold-to-activate for
  dome open, slew near limits, abort plan; one-click Emergency Stop always visible.
- **Multi-site at a glance**, drill into one instrument for detail.

## 2. Main screens

### A) Fleet overview (home)
- Tile per site/instrument: safety state (green/yellow/red), connection, current
  activity (idle/slewing/exposing), current target, weather summary, all-sky thumb.
- Global banner: any UNSAFE/FAULT site, active ToO alerts, Emergency Stop button.

### B) Instrument console (the cockpit)
Split view for one instrument:
- **Sky/mount panel**: interactive sky chart (target, horizon mask, moon, current
  pointing), click-to-slew, RA/Dec goto box, N/S/E/W jog + rate, track/park/abort.
- **Camera panel**: exposure controls, loop/preview, cooler, gain/bin, **live image
  preview** with zoom/pan + histogram/stretch, plate-solve "center here" button.
- **Dome panel**: open/close/rotate, slave toggle, shutter state.
- **Focuser/filter panel**: position, autofocus button + last V-curve, filter select.
- **Guiding panel**: start/stop, guide graph (RA/Dec arcsec), dither.
- **Power panel**: per-outlet switches.
- **Status strip**: live RA/Dec/Alt/Az, dome az, temps, guide RMS, exposure countdown.

### C) Planning workspace
- Target/program management, constraint editor.
- Observability tools: altitude-vs-time, sky chart, observability grid.
- Drag targets onto a **night timeline**; see slew/exposure time estimates.
- Build/validate/dispatch a plan; choose scheduler mode.

### D) Execution monitor
- Live plan tree (plan → blocks → steps) with progress bars and states.
- Per-frame QA badges appearing as the pipeline finishes.
- Controls: pause/resume/skip/abort at any level; reorder/insert blocks.
- Scrolling event/audit log.

### E) Weather & safety dashboard
- All sites' sensors, trends, all-sky views, safety-state history, "time to safe".

### F) Transient alerts inbox
- Incoming candidates, filter that matched, observability now, suggested config.
- One-click **approve → ToO**, or dismiss; shows GW/neutrino localization maps with
  our tiling overlay.

### G) Archive browser
- Search images by program/target/date/filter/QA/**cone search (RA,Dec,radius)**.
- Preview, FITS header viewer, download (HTTPS) or get **SFTP/FTP path**, bulk export.

### H) Admin
- Sites/instruments/devices config, users/roles/programs, alert-source config,
  notification routing, system health.

## 3. Real-time transport
- **WebSocket (WSS)** from the Realtime gateway for telemetry & events; **SSE** as a
  fallback. Topics are scoped (subscribe to `site/A/instrument/1`).
- Telemetry is **rate-managed**: 1–5 Hz for active panels, throttled/aggregated for
  overview tiles; the client subscribes only to what's visible.
- Live previews delivered as compressed JPEG/PNG (full FITS only on explicit
  download) to keep the UI snappy over modest links.
- Optimistic command feedback: button → "command sent" → ack → terminal result, with
  the device's own telemetry confirming (never trust the click alone).

## 4. Tech (see [09-TECH-STACK.md](09-TECH-STACK.md))
- **React + TypeScript**, Vite.
- State/data: TanStack Query (REST) + a WebSocket client feeding a store (Zustand/
  Redux) for live state.
- Charts: uPlot/Plotly for telemetry; a FITS/JS viewer (e.g., **JS9** or Aladin Lite
  for sky charts) for image & sky display.
- Sky charts: **Aladin Lite** (embeds real sky surveys, overlays targets/footprints).
- Component lib + design system for consistent, accessible, high-contrast night-mode
  (dark, red-accent "observatory" theme to preserve dark adaptation).

## 5. Accessibility & ergonomics
- **Night mode / red theme** to protect dark adaptation if used near a site.
- Keyboard shortcuts for common ops (abort, jog, expose).
- Clear, debounced dangerous actions; confirmation + audit reason for safety-relevant
  overrides.
- Responsive enough for a tablet in the dome, full power on the desktop console.

See **[09-TECH-STACK.md](09-TECH-STACK.md)** for concrete technology choices.
