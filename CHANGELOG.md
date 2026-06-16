# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-06-16

### Added

- **Domains & FinOps**: domains are first-class assets (registrar, expiry,
  auto-renew, nameservers, costs) with 60/30/7-day renewal alerts and a
  many-to-many link to projects; a `/finance` dashboard aggregates annual
  renewals and cloud spend per currency with upcoming payments. Migrations
  0004–0005.
- **Pluggable connectors**: the Apache-2.0 SDK is split into the standalone
  `webmana-connectors` repo; the worker auto-discovers third-party
  `webmana-connector-*` packages at boot (no fork). Includes a
  `create-webmana-connector` scaffold and a verified repo-split kit.

### Changed

- **Licensing/docs**: bundled the full verbatim AGPL-3.0 and Apache-2.0 license
  texts (were stubs); rewrote the README for the self-hosted portfolio app; added
  an AGPL §13 "Source code" link in the app footer (`SOURCE_URL`).

### Earlier in this cycle

- **Portfolio lifecycle**: projects now have a status (idea → in_progress →
  rebuild → live → paused → archived), an optional domain, a description, and
  links. The dashboard is a kanban board grouped by status with inline status
  changes; a new `/projects/[id]` detail page shows status, links, and (for live
  projects) SLA, connectors, metrics, events, and alert rules. The worker only
  polls connectors for live/rebuild projects with a domain. Migration 0002.
- **Authentication**: scrypt password hashing + HS256 JWT session cookies
  (node:crypto). `/api/auth/login`/`logout`/`me`, an AuthGuard protecting all
  `/api/manage/*` writes, a `/login` page, and an env-seeded initial admin.
- **Team & RBAC**: role enforcement (admin > editor > viewer), token-based
  invitations (migration 0003), a `/settings` admin page for members,
  invitations, and MCP tokens, and a public `/invite` acceptance page.
- **Alert management UI**: create/list/delete alert rules per project and
  alert channels per org from the project detail page and API.
- **Dev/deploy connectors**: `github` (repo activity — days since last push,
  open issues, default branch, archived state) and `vercel` (latest deployment
  state, age, target). New `deploy` metric kind. Both surface "in progress vs
  deployed" signals automatically for projects under active development.
- **Management UI / write actions**: a `/manage` page and `/api/manage/*`
  endpoints to create, edit, and delete projects (with tags) and to add,
  enable/disable, and remove connectors per project. Connector API keys are
  encrypted at rest (AES-256-GCM) and never returned in plaintext. This is the
  first set of write actions — the dashboard, MCP, and public status surfaces
  remain read-only.

- **Project tags**: `project_tags` surfaced through the read path — `tags[]`
  on `/api/projects` with `?tag=` filtering, the MCP `list_projects`/`get_project`
  tools, and tag chips plus a filter bar on the dashboard.
- **SLA reporting**: per-project uptime SLA over a trailing window —
  `GET /api/sla` (`windowDays`, `projectId`), an MCP `get_sla_report` tool, and
  a `/sla` report page with a 7/30/90-day switcher.
- **FinOps cost anomaly detection**: the worker raises a warning event when
  AWS month-to-date spend exceeds the previous month's total beyond
  `COST_ANOMALY_THRESHOLD_PCT` (default 20%), deduped per project per month.
- **AI insights**: optional, provider-agnostic (Anthropic or any
  OpenAI-compatible endpoint) project health summaries. Generated on a
  schedule in the worker (poll→store→serve — never at request time), stored in
  `project_insights`, and surfaced via `GET /api/insights`, the MCP
  `get_project_insight` tool, and an AI summary card on the dashboard. Disabled
  cleanly when `AI_API_KEY` is unset.

## [0.1.0] - 2026-06-01

First public release — a read-only, self-hosted multi-domain monitoring
dashboard with a built-in MCP server.

### Added

- **Monorepo & infrastructure**: pnpm + Turborepo workspace, Docker Compose
  stack (web, api, worker, mcp, Postgres/TimescaleDB, Redis), database
  migrations, and GitHub Actions CI (typecheck, lint, build).
- **Connector framework**: `Connector<Raw>` SDK with scheduled polling, error
  isolation, and a pure `fetch`/`normalize` lifecycle.
- **Keyless connectors**: SSL expiry, WHOIS, DNS, HTTP uptime, Mozilla
  Observatory, Elasticsearch cluster health.
- **API-key connectors**: Cloudflare, Google PageSpeed Insights, UptimeRobot,
  GA4 Data API, Datadog monitors, Snyk, AWS Cost Explorer (FinOps).
- **Encrypted secrets**: connector credentials stored with AES-256-GCM,
  decrypted only inside the worker.
- **Dashboard** (Next.js): project list, per-project health, and a public
  status page.
- **REST API** (NestJS): projects, metrics, unified timeline, health score,
  and a sanitized public status endpoint.
- **MCP server**: stdio + HTTP/SSE transports with Bearer-token auth, exposing
  read-only tools (`list_projects`, `get_project_health`,
  `get_project_metrics`, `list_recent_events`).
- **Alerting**: rule evaluation after each sync with webhook, Slack, and email
  (SMTP) channels.
- **Documentation**: architecture overview, connector SDK guide, roadmap,
  contributing guide, and licensing (AGPL-3.0 app / Apache-2.0 SDK packages).

[Unreleased]: https://github.com/WebmanaProject/webmana/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/WebmanaProject/webmana/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/WebmanaProject/webmana/releases/tag/v0.1.0
