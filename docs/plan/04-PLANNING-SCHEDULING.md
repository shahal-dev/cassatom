# 04 — Planning, Scheduling & Execution

Three distinct layers, deliberately separated:

1. **Planning** — *what* could be observed and whether/when it's observable.
2. **Scheduling** — *in what order* to observe, optimizing a figure of merit.
3. **Execution** — *actually doing it* on hardware, with live status and control.

Manual control sits alongside all three: an operator can ignore the schedule and
drive the telescope by hand at any time.

## 1. Planning

### Targets & programs
- **Program / Proposal**: an observing campaign with a PI, priority, time budget,
  and a set of targets. (Maps to RBAC and to FTP data scoping.)
- **Target**: name, coordinates (RA/Dec ICRS, or ephemeris for solar-system /
  moving objects), magnitude, type, and **constraints**.
- **Observation request (block)**: target + instrument config (filters, exposure
  times, counts, binning, dither pattern, cadence) + constraints + priority.

### Constraints (composable)
- Altitude/airmass limits, horizon mask per site
- Hour-angle / meridian-flip avoidance windows
- **Moon**: separation & illumination limits
- Sky brightness / twilight (astronomical/nautical), Sun altitude
- Time window (start/end), cadence (e.g., every 30 min), max parallactic rotation
- Instrument availability & capability match (does the site have the filter?)

### Observability engine
Use **Astropy + Astroplan** for the astronomy math:
- Rise/set/transit, airmass curves, moon separation, twilight times per site.
- "Is target X observable from site Y tonight, and during which windows?"
- Visualizations: altitude-vs-time plots, sky charts, an **observability grid**
  (targets × sites × time).

This layer is pure calculation — no hardware — so it runs in the core and powers the
planning UI (drag targets onto a timeline, see when they're up).

## 2. Scheduling

The scheduler turns observable requests into an **ordered, time-allocated plan** per
instrument/site.

### Modes
| Mode | Description |
|------|-------------|
| **Manual list** | Operator hand-orders blocks; scheduler just validates feasibility |
| **Greedy / next-best** | At each decision point pick the highest figure-of-merit observable block (good default, robust to weather changes) |
| **Optimizing** | Plan the whole night to maximize total score (e.g., via Astroplan's sequential/priority schedulers, or an ILP/heuristic) |
| **Reactive** | Insert high-priority **transient follow-up** ToO blocks, preempting lower-priority work |

### Figure of merit (configurable weights)
A score combining: scientific priority, airmass (lower better), time criticality
(deadline approaching), moon penalty, slew cost from current pointing, expected
image quality, and **ToO override** for transients. The greedy scheduler is the
recommended default — simple, explainable, and naturally resilient when clouds force
re-planning. Astroplan provides `PriorityScheduler` / `SequentialScheduler` and a
constraints/transitioner framework to build on.

### Multi-site dispatch
The scheduler is **site-aware**: a target visible from two sites is assigned where it
scores best (better airmass, clearer weather, right instrument). Each site gets its
own ordered queue; the core coordinates so the same target isn't needlessly
duplicated (unless multi-site simultaneous observation is the goal, e.g., parallax
or coverage).

### Re-planning triggers
Weather change, device fault, QA failure (re-observe), new ToO alert, or operator
edit → scheduler recomputes the affected site's queue. Greedy mode handles this
naturally.

## 3. Execution engine

### Hierarchy
```
Plan ─┬─ Block (one target/config) ─┬─ Step (slew, focus, filter, expose, dither)
      └─ Block ...                   └─ Step ...
```

### Execution coordinator (core) + Sequence Executor (edge)
- Core dispatches a **block** (and a small look-ahead queue) to the site.
- The edge **Sequence Executor** runs the block's steps:
  `safety-check → slew → (center via plate-solve) → set filter → autofocus if needed
   → start guiding → expose (×N with dithers) → save → next`.
- Every step emits **live progress** (slew %, exposure countdown, guide RMS) onto the
  bus → operator console.

### Control verbs (operator can issue at any granularity)
`pause`, `resume`, `skip step`, `skip block`, `abort block`, `abort plan`,
`re-order queue`, `insert block`, `take manual control` (preempt). All audited.

### Live updates while executing (FR-6)
The operator console shows, in real time:
- Current block/target, step, and overall plan progress bar.
- Exposure countdown + live preview as soon as readout completes.
- Mount RA/Dec/Alt/Az, dome azimuth/shutter, guiding graph, focuser/temp.
- Weather & safety state banner.
- Per-frame QA badges as the pipeline finishes each image.
- A scrolling **event/audit log** of every command and state change.

### Robustness
- If the link drops mid-block, the edge finishes/aborts safely and continues the
  cached queue only if **autonomous mode** is enabled for that site; otherwise it
  parks after the current exposure and waits.
- A block has a **timeout & retry policy**; repeated failure marks it failed and
  moves on, notifying the operator.
- **Dry-run / validation**: any plan can be checked for timing, slew limits and
  visibility (without commanding the mount) before going on-sky.

## 4. Calibration planning
Bias/dark/flat acquisition is modeled as special blocks:
- **Flats**: twilight sky flats (scheduled around the right Sun altitude window) or
  dome/panel flats (CoverCalibrator) anytime.
- **Darks/bias**: anytime the dome is closed (e.g., cloudy nights, daytime), matched
  to the science gain/temp/exposure grid.
- The scheduler can auto-insert needed calibrations based on what masters are
  missing/expired.

## 5. Target of Opportunity (ToO) / transient follow-up
When the [alert broker](05-TRANSIENT-BROKER.md) emits a qualifying candidate:
1. Create a high-priority observation request from the alert (coords, suggested
   filters/exposures by alert type).
2. Scheduler evaluates observability across sites **now**.
3. Either **auto-insert** (autonomous policy) or **page the operator** for one-click
   approve → preempts current lower-priority block.
4. Time-critical alerts (GRB, GW, kilonova) get the highest figure-of-merit weight
   and tightest latency path.

## 6. APIs (illustrative)
```
POST /programs                      create program/proposal
POST /targets                       add target (+constraints)
POST /requests                      submit observation request (block)
GET  /observability?target&site&date    altitude/visibility windows
POST /schedule/plan?site&date       build a plan
GET  /plans/{id}                    plan + live status
POST /plans/{id}:start | pause | resume | abort
POST /blocks/{id}:skip | abort
POST /devices/{id}/manual/...       direct manual commands (preempt)
WS   /stream/site/{id}              live telemetry & events
```

See **[05-TRANSIENT-BROKER.md](05-TRANSIENT-BROKER.md)** next.
