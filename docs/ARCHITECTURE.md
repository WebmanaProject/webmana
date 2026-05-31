# Webmana — Architecture

Webmana is an open-source, **self-hosted single pane of glass** for solo founders who
run many domains/projects (target: ~10–30). It aggregates data from external tools via
API, normalizes it, and serves it to a dashboard **and** to AI clients through a built-in
**Model Context Protocol (MCP)** server.

The MVP is **read-only**: it visualizes data and sends alerts, but never modifies external
resources.

## Core principle: poll → normalize → store → serve

External APIs (Cloudflare, PageSpeed, GA4, UptimeRobot, …) are slow and rate-limited.
Webmana **never** calls them during a UI or MCP request. Instead:

1. **Poll** — scheduled workers fetch from each connector on its own cadence.
2. **Normalize** — raw payloads are mapped to a shared metric/event shape.
3. **Store** — normalized data lands in PostgreSQL/TimescaleDB.
4. **Serve** — the UI and the MCP server read only from the local store.

This decouples the product from external latency and rate limits, and means the dashboard
stays fast and the AI gets consistent, cached context.

```
External APIs (Cloudflare, GA4, PageSpeed, Datadog, UptimeRobot, ...)
        │  scheduled polling, rate-limit aware, retry/backoff
        ▼
  Connector Workers  ──► Normalizer ──► PostgreSQL (+ TimescaleDB)
        │                                     ▲          │
   Job Queue (Redis / BullMQ)                 │          │
                                              │          ▼
                                         API (NestJS) ◄─► Redis cache
                                         /          \
                                    Web UI         MCP Server
                                   (Next.js)   (stdio + HTTP/SSE → Cursor)
```

## Tech stack (locked)

| Layer        | Choice                                                            |
|--------------|-------------------------------------------------------------------|
| Monorepo     | pnpm workspaces + Turborepo                                       |
| Language     | TypeScript end-to-end                                             |
| Frontend     | Next.js (App Router), Tailwind, shadcn/ui, TanStack Query, Recharts |
| API          | NestJS (modular — fits the plugin/connector model)               |
| Workers      | BullMQ (Redis) — scheduling, rate limiting, retry/backoff        |
| MCP          | `@modelcontextprotocol/sdk` — stdio + HTTP/SSE transports        |
| Database     | PostgreSQL + TimescaleDB (time-series metrics)                   |
| ORM          | Drizzle (chosen over Prisma for Timescale/SQL fit)               |
| Cache/queues | Redis                                                            |
| Secrets      | API keys encrypted at rest (pluggable key provider)             |
| Deploy       | Docker Compose (web, api, worker, mcp, postgres, redis)         |

## Monorepo layout

```
webmana/
├─ apps/
│  ├─ web/          # Next.js dashboard (AGPL-3.0)
│  ├─ api/          # NestJS REST/tRPC, auth, RBAC (AGPL-3.0)
│  ├─ worker/       # BullMQ scheduler + connector runners (AGPL-3.0)
│  └─ mcp/          # MCP server, stdio + HTTP/SSE (AGPL-3.0)
├─ packages/
│  ├─ contracts/    # Zod schemas + shared types (Apache-2.0)
│  ├─ connectors/   # Connector SDK + built-in connectors (Apache-2.0)
│  ├─ db/           # Drizzle schema + migrations (AGPL-3.0)
│  └─ core/         # health score, normalizers, shared utils (AGPL-3.0)
├─ docker-compose.yml
└─ .env.example
```

## Data model (core entities)

- `organizations`, `users`, `roles`, `memberships` — RBAC foundation.
- `projects` (a domain/project) + `project_tags`.
- `connector_instances` — a connector configured for a project; **API keys encrypted at rest**.
- `metrics` — TimescaleDB hypertable of normalized time-series points.
- `events` / `incidents` — unified activity timeline across all sources.
- `alert_rules`, `alert_channels`, `alert_history` — alerting.
- `mcp_tokens` — tokens scoped to RBAC roles (AI inherits permissions, never bypasses them).

## Connector framework

The most important piece. A connector implements a common interface; the worker runs it,
isolates failures (one broken connector must not break the dashboard), and records sync
status.

```ts
interface Connector {
  id: string;                         // e.g. "cloudflare"
  configSchema: ZodSchema;            // validates keys/settings
  schedule: CronExpr;                 // polling cadence
  fetch(ctx: ConnectorContext): Promise<RawData>;
  normalize(raw: RawData): NormalizedMetric[];
}
```

**Built-in connectors that need no external keys** (work right after `docker compose up`):
SSL expiry, WHOIS, DNS, HTTP uptime. The first end-to-end reference connector is **SSL expiry**.

## RBAC and MCP security

- Roles: `admin` (manages connectors/users), `editor`, `viewer`.
- A single authorization guard in the API enforces permissions, and the **MCP server reuses
  the same guard**.
- MCP exposes the same data as the UI, as **resources** (e.g. `project://{id}/health`) and
  **read-only tools** (`list_projects`, `get_project_health`, `query_metrics`,
  `get_ssl_status`, `list_incidents`).
- HTTP/SSE transport authenticates with a Bearer token from `mcp_tokens`; every call is
  filtered by that token's role scope. stdio transport is for a local Cursor instance.

## Metric retention (TimescaleDB)

- Raw points: **90 days**.
- Hourly rollup (continuous aggregate): **1 year**.
- Daily rollup: **indefinite**.

Configurable; defaults chosen for the ~10–30 domain target where volume is small.

## Licensing

- Application (`apps/*`, `packages/db`, `packages/core`): **AGPL-3.0-only** — prevents closed
  SaaS forks (network-use clause fits the hosted MCP server).
- SDK (`packages/contracts`, `packages/connectors`): **Apache-2.0** — so the community can
  build and distribute connectors without copyleft friction.
- Contributions use **DCO** sign-off (`git commit -s`).
