# Webmana

**Self-hosted command center for your whole domain portfolio — with a built-in MCP server for AI.**

Webmana is an open-source, self-hosted app for managing many domains and
projects across their entire lifecycle: from *idea* → *in progress* → *rebuild*
→ *live* → *paused* → *archived*. It tracks registrations, renewals and costs,
monitors what's deployed (uptime, SSL, DNS, performance, security, cloud spend),
and exposes everything read-only to AI clients over the Model Context Protocol.

Built for people running **a dozen or more domains** — solo or in a small team —
who are tired of scattering that across registrar dashboards, spreadsheets, and
uptime tools.

> Status: **v0.2.0.** See [CHANGELOG.md](CHANGELOG.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Highlights

- **Portfolio board** — a kanban of every project by lifecycle stage; drag a
  card to change its stage. Monitoring only runs once a project is live.
- **Domains as first-class assets** — registrar, expiry, auto-renew, nameservers,
  costs; renewal alerts at 60/30/7 days; a domain can back several projects.
- **FinOps dashboard** — annual renewal totals per currency, upcoming payments,
  cloud month-to-date spend, and a full cost breakdown.
- **Monitoring connectors** — uptime, SSL, WHOIS, DNS, PageSpeed, Cloudflare,
  GA4, UptimeRobot, Datadog, Snyk, AWS Cost, GitHub, Vercel — and **your own**,
  via a separate Apache-2.0 SDK (see [Connectors](#connectors)).
- **Alerting** — rules per project with webhook, Slack, and email channels, plus
  cost-anomaly and domain-expiry detection.
- **Teams & RBAC** — local accounts, roles (admin / editor / viewer), email
  invitations, and per-token MCP access.
- **AI insights** *(optional)* — scheduled natural-language project summaries via
  any Anthropic- or OpenAI-compatible model. Off until you set a key.
- **MCP server** — read-only tools over stdio + HTTP/SSE, scoped by the same RBAC
  as the API, so an assistant can answer questions about your portfolio.
- **Light & dark theme.** 100% self-hosted. Your data never leaves your box.

## How it works

Webmana follows a strict **poll → normalize → store → serve** pipeline. Scheduled
workers fetch from each connector on its own cadence, normalize the results to a
shared metric/event shape, and store them in PostgreSQL/TimescaleDB. The
dashboard, API, and MCP server only ever read from the local store — external
APIs are never called during a request. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start (Docker)

Requires Docker + Docker Compose.

```bash
cp .env.example .env
# Set at least: POSTGRES_PASSWORD, SECRET_ENCRYPTION_KEY (openssl rand -base64 32),
# JWT_SECRET, MCP_TOKEN, and the initial ADMIN_EMAIL / ADMIN_PASSWORD.
docker compose up --build
```

The `migrate` service applies database migrations on start, and the first admin
account is seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Then open:

- Dashboard: http://localhost:3000 (sign in at `/login`)
- Public status page: http://localhost:3000/status
- API health: http://localhost:4000/api/health
- MCP (HTTP/SSE): http://localhost:4100/sse

> **Before exposing it publicly:** change `JWT_SECRET`, `ADMIN_PASSWORD`, and
> `SECRET_ENCRYPTION_KEY`, and set `COOKIE_SECURE=true` behind HTTPS.

## Connectors

The connector SDK and the built-in connectors live in a **separate repository**,
[`webmana-connectors`](https://github.com/WebmanaProject/webmana-connectors),
licensed **Apache-2.0** — deliberately apart from this AGPL app so anyone can
write and publish connectors under a permissive license.

Scaffold and publish your own:

```bash
npm create webmana-connector@latest my-thing
# build, publish to npm, then add it next to the worker:
pnpm --filter @webmana/worker add webmana-connector-my-thing
```

Webmana auto-discovers any installed `webmana-connector-*` package (or one that
sets `"webmana": { "connector": true }`) at startup — no fork required. See
[docs/CONNECTORS.md](docs/CONNECTORS.md).

## Local development

Requires Node 22+ and pnpm 11.

```bash
pnpm install
pnpm dev          # runs all apps via Turborepo
pnpm typecheck
pnpm build
```

### Project layout

```
apps/
  web/      Next.js dashboard            (AGPL-3.0)
  api/      NestJS API, auth, RBAC       (AGPL-3.0)
  worker/   BullMQ scheduler + runners   (AGPL-3.0)
  mcp/      MCP server (stdio + HTTP/SSE)(AGPL-3.0)
packages/
  contracts/  Zod schemas + shared types  (Apache-2.0, mirrored to webmana-connectors)
  connectors/ Connector SDK + built-ins   (Apache-2.0, mirrored to webmana-connectors)
  crypto/     Secret encryption helpers   (AGPL-3.0)
  db/         Drizzle schema + migrations  (AGPL-3.0)
```

## License

Webmana is free software under the **GNU AGPL-3.0-only** — see [LICENSE](LICENSE).
Because it's AGPL, anyone you let use the app over a network is entitled to its
source: a "Source" link in the app footer points back to this repository (set
`SOURCE_URL` to your fork if you modify it).

The connector SDK packages (`packages/contracts`, `packages/connectors`, and the
`webmana-connectors` repo) are **Apache-2.0**, so connectors carry no copyleft
obligation.

Contributions require a [DCO](DCO.md) sign-off — commit with `git commit -s`.
See [CONTRIBUTING.md](CONTRIBUTING.md).
