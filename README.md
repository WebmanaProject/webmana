# Webmana

**Self-hosted single pane of glass for your domains — with a built-in MCP server for AI.**

Webmana aggregates data from external tools (Cloudflare, PageSpeed, GA4, UptimeRobot, SSL,
WHOIS, DNS, and more) for all your projects into one dashboard, and exposes it to AI clients
(e.g. Cursor) over the Model Context Protocol. Built for **solo founders running many domains**.

The MVP is **read-only**: it visualizes data and sends alerts, it does not modify resources.

> Status: **Phase 0 — scaffold.** See [docs/ROADMAP.md](docs/ROADMAP.md).

## Quick start (Docker)

```bash
cp .env.example .env      # adjust secrets
docker compose up --build
```

Then open:

- Dashboard: http://localhost:3000
- API health: http://localhost:4000/api/health
- MCP (HTTP/SSE): http://localhost:4100/sse

## Local development

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm dev          # runs all apps via Turborepo
```

## Project layout

```
apps/
  web/      Next.js dashboard            (AGPL-3.0)
  api/      NestJS API, auth, RBAC       (AGPL-3.0)
  worker/   BullMQ scheduler + runners   (AGPL-3.0)
  mcp/      MCP server (stdio + HTTP/SSE)(AGPL-3.0)
packages/
  contracts/  Zod schemas + shared types (Apache-2.0)
  db/         Drizzle schema + migrations (AGPL-3.0)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

## Licensing

- Application code: **AGPL-3.0-only** (prevents closed SaaS forks).
- Connector SDK packages (`packages/contracts`, `packages/connectors`): **Apache-2.0**.
- Contributions require a **DCO** sign-off — commit with `git commit -s`.
  See [DCO.md](DCO.md).
