# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

[Unreleased]: https://github.com/your-org/webmana/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/your-org/webmana/releases/tag/v0.1.0
