# 10 — Security & Operations

Telescopes are remote, expensive, internet-exposed, and physically dangerous if
mis-driven. Security and ops discipline are not optional.

## 1. Network security
- **WireGuard mesh VPN**: every link (browser↔core can be TLS public; core↔site is
  VPN-only). Sites **dial out** to the core hub → **no inbound ports open at the
  observatory**, no public IP needed.
- Device drivers (Alpaca/INDI) bind only to the site's private/VPN interface — never
  the public internet. Telescope drivers have weak/no auth; they must never be
  reachable externally.
- TLS everywhere for HTTPS/WSS; modern ciphers; HSTS.
- Per-site firewall: default-deny; allow only VPN + NTP + outbound alert streams.

## 2. Authentication & authorization
- **Users**: SSO/OIDC (IUB identity if available) or local accounts with strong
  password policy + **MFA** for operators/admins.
- **RBAC roles**: `admin` (config, users), `operator` (full manual + execution),
  `observer/PI` (own program: plan, view, download), `viewer` (read-only).
- **Service-to-service**: mutual TLS or signed tokens on the bus; each Site Agent has
  its own credential/identity.
- **API tokens** with scopes for scripted access (e.g., a PI's download script).
- **Data scoping**: observers see only their program's images (enforced in API and in
  the SFTP/FTP gateway via per-user chroot).

## 3. Command safety & audit
- Every command (manual or automated) is **authenticated, authorized, and audited**
  (who/what/when/result) in `audit_log`.
- Dangerous actions (dome open, override a safety state, abort plan) require explicit
  confirmation and, for safety overrides, a logged reason.
- Commands carry **TTL + idempotency keys** so stale commands after reconnect are
  rejected, not replayed.
- **Device ownership lock** (Redis) prevents two actors driving one device; "take
  control" is an explicit, audited preemption.

## 4. Secrets
- No secrets in git. **Vault** or **SOPS-encrypted** files; injected at runtime.
- Per-site credentials rotated; revocable independently (compromise of one site ≠
  compromise of the fleet).
- Alert-source credentials (GCN, TNS bot, broker keys) stored centrally, scoped.

## 5. Reliability & operations
- **Watchdogs**: hardware + software watchdog on each Site Agent; auto-restart modules;
  escalate to `FAULT` + page humans if recovery fails.
- **Graceful degradation**: defined behavior for every dependency loss (core down,
  DB down, bus down, sensor dead) — documented in runbooks.
- **No unattended auto-updates at night**: edge nodes update only in maintenance
  windows, never mid-observation. Staged rollouts (one site first).
- **UPS** at every site sized to park + close + clean shutdown.

## 6. Backups & DR
- Postgres: streaming replica + WAL archiving (PITR); nightly base backups offsite.
- Object store: versioning + offsite replication of the archive.
- Config-as-code (site/instrument/device configs in git or Vault) for fast rebuild.
- **Documented + drilled** restore procedure; periodic test restores.

## 7. Monitoring & alerting
- **Prometheus + Grafana**: service health, queue depths, bus lag, upload backlog,
  solve success rate, disk space (edge!), DB load, telemetry freshness.
- **Loki** logs, **OpenTelemetry** traces, **Sentry** for exceptions.
- Alert rules: edge disk filling, upload backlog growing, telemetry stale, solve
  failures rising, safety FAULT, certificate expiry, backup failed.
- **Heartbeat** from every Site Agent; missing heartbeat → page (could mean a site is
  blind and possibly open).

## 8. Compliance & good-citizen
- Respect alert-source terms (GCN, TNS, brokers): rate limits, attribution,
  authenticated bots.
- Scrapers respect robots.txt and rate limits.
- Data licensing/embargo per program; proprietary periods enforced before public
  release (if ever made public).

## 9. Runbooks (write these as you build)
- "Site went UNSAFE and won't clear" · "Mount won't park" · "Upload backlog" ·
  "Plate-solve failing on instrument X" · "Core failover" · "Restore from backup" ·
  "Onboard a new site/instrument" · "Rotate a compromised credential".

See **[11-ROADMAP.md](11-ROADMAP.md)** for delivery sequencing.
