# 07 — Database Design

## 1. Storage engines

| Engine | Holds | Why |
|--------|-------|-----|
| **PostgreSQL** (+ **PostGIS**, + **pgSphere**/Q3C) | Relational core: inventory, programs, targets, plans, images metadata, alerts, users, audit | ACID, rich queries, spherical/geo extensions for sky & site coords |
| **TimescaleDB** (Postgres extension) | High-rate telemetry time-series: mount/dome/camera/weather samples, guide errors | Efficient time-series, downsampling, retention policies |
| **Object store (S3/MinIO)** | FITS files, previews, masters, all-sky frames | Cheap, scalable bytes; DB stores keys only |
| **Redis** | Live state cache, locks (device ownership), pub/sub fan-out, rate limits | Fast ephemeral state |

> **Q3C / pgSphere** give fast cone-search ("all images/alerts within R of RA,Dec"),
> essential for cross-matching transients and finding archival coverage of a target.

## 2. Core relational schema (sketch)

### Inventory & config
```
site(id, name, lat, lon, elevation_m, timezone, horizon_profile_id, status, ...)
horizon_profile(id, site_id, az_alt_points jsonb)
instrument(id, site_id, name, focal_length_mm, aperture_mm, status, ...)
device(id, instrument_id|site_id, role, adapter, connection jsonb,
       capabilities jsonb, limits jsonb, status, last_seen)
filter(id, instrument_id, name, focus_offset, position_index)
```

### People & access
```
user(id, name, email, role, ...)               role: admin|operator|observer|viewer
program(id, name, pi_user_id, priority, time_budget_s, time_used_s, status)
program_member(program_id, user_id, role)
api_token(id, user_id, scopes, hash, expires_at)
audit_log(id, ts, actor_id, action, target_type, target_id, payload jsonb, result)
```

### Planning & scheduling
```
target(id, program_id, name, ra_icrs, dec_icrs, epoch, pm_ra, pm_dec,
       ephemeris jsonb,        -- for moving objects
       mag, obj_type, created_by)
constraint_set(id, target_id|request_id, rules jsonb)   -- alt, moon, time windows...
observation_request(id, program_id, target_id, instrument_pref,
       config jsonb,           -- filters, exptimes, counts, binning, dither, cadence
       constraint_set_id, priority, state, deadline, created_by)
plan(id, site_id, instrument_id, ut_date, mode, state, score, created_by)
block(id, plan_id, request_id, seq, state, scheduled_start, started_at, ended_at,
      result, score)
block_step(id, block_id, seq, kind, params jsonb, state, started_at, ended_at)
```
`state` enums make the live UI and recovery deterministic
(`pending|queued|running|paused|done|failed|aborted|skipped`).

### Images & data products
```
image(id, obsid, block_step_id, site_id, instrument_id, image_type,
      date_obs_utc, mjd_obs, exptime, filter, binning, gain, offset, ccd_temp,
      ra, dec, alt, az, airmass, pierside,
      wcs jsonb,               -- CRVAL/CRPIX/CD + solve RMS
      object_key_raw, object_key_cal, preview_key, thumb_key,
      sha256, fits_checksum, calibrated bool, master_set_id,
      qa jsonb,                -- fwhm, bkg, nstars, ellipticity, sat_frac, cloud_flag
      status, created_at)
master_frame(id, instrument_id, type, params jsonb, object_key, valid_from, valid_to, version)
```
Add a **Q3C/pgSphere spatial index** on `(ra, dec)` for cone search.

### Telemetry (TimescaleDB hypertables)
```
telemetry_mount(ts, device_id, ra, dec, alt, az, slewing, tracking, pier_side)
telemetry_dome(ts, device_id, azimuth, shutter_state, slaved)
telemetry_camera(ts, device_id, state, ccd_temp, cooler_pct, exposure_pct)
telemetry_guide(ts, instrument_id, rms_ra_arcsec, rms_dec_arcsec, star_mass)
telemetry_weather(ts, site_id, temp, humidity, dewpoint, pressure, wind, gust,
                  wind_dir, rain, sky_temp, sqm, seeing)
safety_event(ts, site_id, from_state, to_state, reason, detail jsonb)
```
Continuous aggregates → 1 s raw down to 1 min / 5 min rollups for fast plotting;
retention policy drops raw after N weeks but keeps rollups for years.

### Alerts (transient broker)
```
alert(id, source, source_event_id, received_utc, event_utc, type,
      ra, dec, error_radius, localization_key,   -- HEALPix/MOC map in object store
      magnitude, mag_band, classification, class_prob, redshift, host,
      urls jsonb, raw_packet jsonb, dedup_group_id)
alert_filter(id, program_id, name, rules jsonb, enabled, version)
alert_match(id, alert_id, filter_id, score, observable jsonb, action, request_id)
```

## 3. Key relationships
```
program 1─* target 1─* observation_request 1─* block 1─* block_step 1─* image
site 1─* instrument 1─* device
alert *─* alert_filter (via alert_match) ──▶ observation_request (ToO)
```

## 4. Data lifecycle & retention
| Data | Policy |
|------|--------|
| Raw FITS | Keep forever; warm → cold tier after ~3 months |
| Calibrated FITS / previews | Keep; regenerable from raw + recipe |
| Telemetry raw (1 Hz) | Keep ~4–8 weeks, then rollups only |
| Telemetry rollups | Keep years |
| Alerts (raw packets) | Keep (small, jsonb); valuable for re-processing |
| Audit log | Keep long-term (compliance/post-mortem) |

## 5. Integrity & backups
- FITS: dual checksums (FITS standard + SHA-256) verified on ingest & transfer.
- Postgres: streaming replication + nightly base backups (PITR with WAL archiving).
- Object store: versioning + cross-site/offsite replication for the archive.
- Regular **restore drills** — a backup you've never restored is a hope, not a backup.

## 6. Why not a single big table / NoSQL
The domain is highly relational (programs→targets→requests→blocks→images) and benefits
from constraints, joins, and spherical indexing. Postgres + Timescale + an object
store covers relational, time-series, and blob needs without operating five different
databases. Add specialized stores only if a real bottleneck appears.

See **[08-FRONTEND.md](08-FRONTEND.md)** for the operator experience.
