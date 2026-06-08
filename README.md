# Webmana

**Self-hosted single pane of glass for your domains — with a built-in MCP server for AI.**

Webmana aggregates data from external tools (Cloudflare, PageSpeed, GA4, UptimeRobot, SSL,
WHOIS, DNS, Datadog, Snyk, AWS Cost Explorer, and more) for all your projects into one
dashboard, and exposes it to AI clients (e.g. Cursor) over the Model Context Protocol.
Built for **solo founders running many domains** (target: ~10–30).

Projects and connectors are managed from a built-in admin UI (`/manage`); the
dashboard, MCP server, and public status page remain read-only views over the
collected data.

> Status: **v0.1.0.** See [CHANGELOG.md](CHANGELOG.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## How it works

Webmana follows a strict **poll → normalize → store → serve** pipeline. Scheduled workers
fetch from each connector on its own cadence, normalize the results to a shared
metric/event shape, and store them. The dashboard, API, and MCP server only ever read from
the local store — external APIs are never called during a request. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Features

- **Connectors** — keyless (SSL expiry, WHOIS, DNS, HTTP uptime, Mozilla Observatory,
  Elasticsearch) and key-based (Cloudflare, PageSpeed, UptimeRobot, GA4, Datadog, Snyk,
  AWS Cost Explorer, GitHub, Vercel). Encrypted credential storage (AES-256-GCM).
- **Health score & timeline** — a unified health band per project and a cross-project
  activity/incident feed.
- **Alerting** — rule evaluation after each sync with webhook, Slack, and email (SMTP)
  channels, plus FinOps cost-anomaly detection.
- **Project tags** — group projects by client/environment/team and filter by tag.
- **SLA reporting** — per-project uptime over trailing windows.
- **AI insights** *(optional)* — scheduled natural-language project summaries via any
  Anthropic or OpenAI-compatible model. Disabled until `AI_API_KEY` is set.
- **MCP server** — read-only tools over stdio + HTTP/SSE, scoped through the same RBAC guard
  as the API.

## Quick start (Docker)

```bash
cp .env.example .env      # adjust secrets: POSTGRES_PASSWORD, SECRET_ENCRYPTION_KEY, MCP_TOKEN
docker compose up --build
```

The `migrate` service applies Drizzle migrations + TimescaleDB setup automatically on start.
Then open:

- Dashboard: http://localhost:3000
- API health: http://localhost:4000/api/health
- Public status page: http://localhost:3000/status
- MCP (HTTP/SSE): http://localhost:4100/sse

## MCP tools

The MCP server exposes read-only, org-scoped tools:

- `list_projects` — projects with tags and connector sync status (optional `tag` filter)
- `get_project` — full detail for one project (connectors, latest metrics, recent events)
- `list_recent_events` — recent events/incidents across all visible projects
- `get_sla_report` — per-project uptime SLA over a trailing window
- `get_project_insight` — latest AI-generated health summary for a project

## Local development

Requires Node 22+ and pnpm 11.

```bash
pnpm install
pnpm dev          # runs all apps via Turborepo
pnpm typecheck
pnpm build
```

## Project layout

```
apps/
  web/      Next.js dashboard            (AGPL-3.0)
  api/      NestJS API, auth, RBAC       (AGPL-3.0)
  worker/   BullMQ scheduler + runners   (AGPL-3.0)
  mcp/      MCP server (stdio + HTTP/SSE)(AGPL-3.0)
packages/
  contracts/  Zod schemas + shared types  (Apache-2.0)
  connectors/ Connector SDK + built-ins   (Apache-2.0)
  crypto/     Secret encryption helpers   (AGPL-3.0)
  db/         Drizzle schema + migrations  (AGPL-3.0)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design and
[docs/CONNECTORS.md](docs/CONNECTORS.md) to build your own connector.

## Licensing

- Application code: **AGPL-3.0-only** (prevents closed SaaS forks).
- Connector SDK packages (`packages/contracts`, `packages/connectors`): **Apache-2.0**.
- Contributions require a **DCO** sign-off — commit with `git commit -s`.
  See [CONTRIBUTING.md](CONTRIBUTING.md) and [DCO.md](DCO.md).
