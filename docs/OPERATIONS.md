# Webmana — Operations Guide

Self-hosting Webmana with Docker Compose: backup, restore, upgrades, and the
secrets you must protect.

## Required secrets (set in `.env`)

| Variable | Purpose | If lost |
|----------|---------|---------|
| `WEBMANA_SECRET_KEY` | Encrypts connector credentials at rest (AES-GCM). Used by **api**, **worker**, and **mcp**. | Connector secrets become undecryptable — you must re-enter every connector's keys. **Back this up separately from the database.** |
| `JWT_SECRET` | Signs session cookies. | All sessions invalidated (users re-login). |
| `DATABASE_URL` | Postgres connection. | — |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seeds the first admin on an empty DB. | — |

Optional: `SMTP_*` (invite emails + weekly digest), `AI_API_KEY`/`AI_PROVIDER`
(AI insights), `ALERT_ESCALATION_MINUTES` (incident escalation threshold).

## Backup

```bash
scripts/backup.sh                # writes ./backups/webmana-<timestamp>.sql.gz
scripts/backup.sh /mnt/backups   # custom directory
```

The dump is the full database (projects, domains, metrics, incidents, audit log,
encrypted connector secrets, …). It does **not** contain `WEBMANA_SECRET_KEY`;
store that key separately or the encrypted secrets in the dump can't be read.

Two layers of in-app export also exist:
- **Portfolio JSON** — Settings → Backup & portability (or `GET /api/portfolio/export`):
  structural data (projects/domains/notes/budgets/FX), no secrets. Good for
  migrating between instances.
- **Renewal calendar (.ics)** and the public **status RSS** are read-only feeds.

## Restore

```bash
scripts/restore.sh ./backups/webmana-20260101-030000.sql.gz
docker compose up -d
```

Restore into a stack whose `WEBMANA_SECRET_KEY` matches the one used when the
backup was taken, so connector secrets decrypt.

## Upgrades

```bash
git pull
docker compose up -d --build       # the `migrate` service applies new migrations
```

Migrations run automatically via the one-shot `migrate` service before `api`
starts. Always take a backup first. Migrations are additive where possible; check
`packages/db/drizzle/` for the SQL of each release.

## Scheduled jobs (worker)

The worker runs on intervals (BullMQ): connector syncs (1m scan), domain-expiry
checks (12h), AI insights (when `AI_API_KEY` set), the weekly portfolio digest,
and incident escalation (5m). No cron setup is needed — they self-schedule on boot.

## Observability

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to ship OpenTelemetry traces from api/worker to
a collector (e.g. Grafana Tempo, Jaeger, Honeycomb). Unset = telemetry disabled
(no overhead). See `docker-compose.yml` for wiring.

## Health

- API: `GET /api/health`
- Public status page: `/status` (+ RSS at `/api/status/rss`)
