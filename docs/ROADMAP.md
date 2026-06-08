# Webmana — Roadmap

Phased delivery. Each phase should be shippable and demoable on its own.

## Phase 0 — Scaffold (current)

- Monorepo (pnpm + Turborepo), TypeScript base config.
- `docker-compose.yml`: web, api, worker, mcp, postgres (TimescaleDB), redis.
- Drizzle schema + migrations with the **RBAC foundation**.
- Auth + RBAC (local accounts, roles admin/editor/viewer).
- Empty dashboard listing projects.
- Licenses (AGPL app / Apache SDK), DCO, docs.

## Phase 1 — Connector framework + keyless built-ins

- Connector SDK (interface, runner, scheduler, error isolation, sync status).
- Built-in connectors needing **no external keys**: SSL expiry, WHOIS, DNS, HTTP uptime.
- First real data on the dashboard. Reference connector: **SSL expiry**.

## Phase 2 — API connectors

- Cloudflare, Google PageSpeed Insights, UptimeRobot, Google Analytics (**GA4 Data API**).
- Encrypted credential storage per connector instance.

## Phase 3 — MCP server

- Transports: **stdio** (local Cursor) + **HTTP/SSE** (remote, Bearer token).
- Resources + read-only tools, all scoped through the shared RBAC guard.

## Phase 4 — Alerting + health score + timeline

- `alert_rules` evaluated after each sync (e.g. SSL < 14 days, uptime below threshold,
  PageSpeed regression).
- Channels: webhook, Slack, email (SMTP), with dedup + cooldown.
- Unified **health score** per project.
- Unified activity/incident timeline.

## Phase 5 — Ecosystem + remaining connectors

- Connector SDK documentation (community connectors).
- Public status page generation.
- Datadog / ELK, CI/CD (GitHub Actions / GitLab CI), Security posture
  (Mozilla Observatory / Snyk), FinOps (cost aggregation).

## Later ideas (backlog)

- ✅ Project tags/grouping (client / environment / team).
- ✅ SLA reporting (uptime over trailing windows). Exportable reports still TODO.
- ✅ Cost anomaly detection in FinOps.
- ✅ AI insights surfaced inside the dashboard (not just via MCP).
- ✅ Management UI (write actions): create/edit/delete projects + connectors via
  `/manage`. Read surfaces (dashboard, MCP, status page) stay read-only.

## Portfolio lifecycle hub (delivered)

Pivot from a monitoring tool to a team portfolio hub, built in phases:

- ✅ **Phase 1** — project lifecycle model (status, optional domain, links).
- ✅ **Phase 2** — kanban portfolio board + project detail page.
- ✅ **Phase 3** — authentication (passwords, JWT sessions, guarded writes).
- ✅ **Phase 4** — team/RBAC (roles, invitations, org settings, MCP tokens).
- ✅ **Phase 5** — alert rule + channel management UI.
- ✅ **Phase 6** — dev/deploy connectors: `github` (repo activity) and `vercel`
  (deploy status). Netlify and per-project notes/TODO remain open follow-ups.

Follow-ups still open: invitation emails via SMTP (tokens are surfaced in the UI
for now), exportable SLA reports, and per-project notes/TODO.
