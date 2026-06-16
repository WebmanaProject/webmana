# Webmana — MVP 2.0 Plan

> Status: **proposal / north star**. MVP 1.0 is shipped (see [`ROADMAP.md`](./ROADMAP.md)).
> This document defines the next major version: where the product goes, how it
> should look, and how the work splits between the **main app repo** (AGPL-3.0)
> and the **connectors repo** (Apache-2.0).

---

## 1. Where we are (MVP 1.0 recap)

Webmana 1.0 is a **self-hosted portfolio hub for solo founders / indie SaaS
builders** running ~10–30 domains. It delivers:

- Lifecycle **kanban** (idea → in&nbsp;progress → rebuild → live → paused → archived).
- **Domains as first-class assets**, managed per project; purchase/renewal costs
  live on the domain; finance aggregates renewals + cloud spend.
- **Auth + RBAC + teams** (admin/editor/viewer, invitations, org settings).
- **Poll → normalize → store → serve** connector engine (keyless + API-key
  connectors), with encrypted secrets at rest.
- **Alerting** (webhook/Slack/email), per-project **health score**, **SLA**
  rollups, **AI insights**, and a built-in **MCP server** (read-only, RBAC-scoped).
- Two-repo model: app is AGPL; the connector SDK is Apache and auto-discovered
  at worker boot (`webmana-connector-*`).

**The defining constraint of 1.0: it is read-only.** It observes and alerts;
it never changes external resources.

### The 2.0 thesis

> Go from *"a dashboard that tells me what's happening"* to
> **"a control room that helps me decide and act on my whole portfolio."**

Three pillars:

1. **Intelligence** — cross-portfolio rollups, profitability, risk, forecasting.
2. **Action** — opt-in, audited, RBAC-gated two-way operations (still safe by default).
3. **Polish & ecosystem** — a refined design system, frictionless onboarding, and a
   real connector marketplace.

Everything below preserves the locked stack and the poll→store→serve rule.
Two-way **actions** are added as an explicit, sandboxed exception (§6, §8.E).

---

## 2. Product principles for 2.0

- **Safe by default, powerful by opt-in.** No destructive or external-mutating
  action happens without an explicit capability grant + role + audit entry.
- **One portfolio, many lenses.** Every screen should answer "how is the whole
  portfolio doing?" before "how is this one project doing?".
- **Self-hosted first.** Single `docker compose up` must still work end-to-end
  with zero external keys. New features degrade gracefully when keys/AI are absent.
- **Keep the core thin; push integrations to the connectors repo.** The app owns
  the model, UX, and orchestration; connectors own vendor specifics.
- **AGPL app / Apache SDK** boundary is sacred — see §9.

---

## 3. Design system 2.0

MVP 1.0 already has a CSS-variable token system (light/dark), an Inter-first type
scale, `.card`/`.btn-accent`/`.btn-ghost`/`.badge` utilities, soft shadows, and a
unified sticky navbar. 2.0 turns that into a **named design system**: *"Aurora"*.

### 3.1 Visual direction

- **Calm, dense, professional.** A control room, not a marketing page. Generous
  hairlines, restrained accent (the existing emerald), strong typographic hierarchy.
- **Data-forward.** Real charts replace number-only cards. Sparklines on tiles,
  full time-series on detail pages (Recharts, already in the locked stack).
- **Status as a first-class color language.** A fixed, documented mapping:
  healthy=accent, degraded=amber, down=red, idle/unknown=slate — used identically
  on kanban dots, health badges, domain expiry, and finance due-dates.

### 3.2 Foundations to formalize

| Area | 2.0 deliverable |
|------|-----------------|
| Tokens | Promote the CSS vars to a documented scale: spacing, radius (sm→2xl), elevation (card/hover/glow), z-index, motion durations. One source of truth in `globals.css` + Tailwind config. |
| Typography | Keep Inter; add a tabular-numeric utility for all tables/metrics; codify h1–h4 + body + caption. |
| Components | Extract a small in-repo component layer (no heavy UI dep): `Card`, `Button`, `Badge`, `Input`, `Select`, `Table`, `Modal`, `Drawer`, `Tabs`, `Toast`, `EmptyState`, `StatTile`, `Sparkline`, `Chart`. shadcn/ui patterns, hand-rolled to stay dependency-light. |
| Theming | Light/dark stays; add a third "system" mode and an accent-color setting per org. |
| Motion | Standardize `fade-in`/`pop-in`; add view-transition page changes; respect `prefers-reduced-motion` (already wired). |
| Density | A compact/comfortable toggle for power users with 30+ projects. |
| Icons | One consistent stroke icon set (currently inline SVGs) → a single `Icon` component. |

### 3.3 Application shell

- **Persistent left rail (≥lg)** + top bar, collapsing to the existing drawer on
  mobile. The current top-only nav graduates to a real shell so deep features
  (incidents, audit, settings sub-pages) have room.
- **Command palette (`⌘/Ctrl-K`)** — jump to any project/domain, run actions,
  toggle theme, change a status. The keyboard-first backbone of 2.0.
- **Global search** across projects, domains, tags, events.
- **Notification center** in the top bar (alerts, incidents, renewals due).

### 3.4 Key screens (redesigned / new)

1. **Portfolio Overview (new home)** — portfolio health gauge, "needs attention"
   queue, upcoming renewals, spend vs. budget, recent incidents — above the kanban.
2. **Kanban** — sparkline + spend on each card, swimlanes by tag/team, saved filters.
3. **Project workspace** — tabs: *Overview · Domains · Monitoring · Finance ·
   Connectors · Activity · Notes*. (Today's single scroll becomes tabs.)
4. **Domain detail** — DNS records, SSL chain, WHOIS history, registrar, cost
   history, transfer-lock status.
5. **Finance** — multi-currency, budgets, forecast, profitability table, renewal calendar.
6. **Incidents** — timeline, ack/resolve, post-mortem notes.
7. **Onboarding wizard** — first-run: create org, add first project + domain,
   connect a keyless connector, see data in < 5 minutes.
8. **Accessibility pass** — focus order, ARIA, contrast AA, full keyboard paths.

### 3.5 Mobile / PWA

- Installable PWA, offline read cache of last sync, push for critical alerts.
- Mobile is review/triage oriented (ack alerts, glance health), not heavy editing.

---

## 4. Feature epics

Each epic is tagged **[APP]** (main AGPL repo) or **[CONN]** (Apache connectors
repo), or **[BOTH]** when it spans the SDK boundary.

### A. Portfolio intelligence **[APP]**
- Portfolio-level health gauge + "needs attention" queue (worst N projects).
- **Per-project notes & TODO** (the open 1.0 follow-up) with markdown + checkboxes.
- **Risk register**: surfaced risks (SSL < 14d, domain expiring, no monitoring on
  a live project, single point of failure) rolled up portfolio-wide.
- **Dependency view**: domain → project → connector graph; flag orphans.
- Weekly **AI digest** email ("3 things to look at this week").

### B. Domains & DNS depth **[APP]** + WHOIS/DNS connectors **[CONN]**
- DNS record viewer (A/AAAA/CNAME/MX/TXT) via a DNS connector; drift detection.
- SSL certificate chain + issuer + SAN list on the domain detail.
- WHOIS auto-refresh → expiry/registrar/lock kept current.
- **Bulk domain import** (CSV / registrar API) and an acquisition pipeline
  (watchlist → bought → assigned).
- iCal/RSS **renewal calendar** export.

### C. FinOps 2.0 **[APP]** + revenue connectors **[CONN]**
- **Multi-currency normalization** with a daily FX rate job; report in a chosen
  base currency.
- **Budgets & forecasts**: monthly/annual budget per project/tag, projected spend,
  variance alerts.
- **Profitability**: pair cost with **revenue connectors** (Stripe, Paddle,
  LemonSqueezy, Polar) → MRR, margin, and "is this domain worth keeping?".
- Cost allocation by tag/team; exportable CSV/PDF finance report.

### D. Alerting & incidents 2.0 **[APP]**
- **Incident lifecycle**: open → acknowledged → resolved, with owner + notes,
  built on the existing `events` timeline.
- **Routing & escalation**: rules by severity/tag/time; quiet hours; escalation
  after N minutes unacked.
- **Maintenance windows** that suppress alerts.
- **Status page 2.0**: subscribers, RSS/email updates, custom domain, incident history.

### E. Actions framework (two-way, opt-in) **[BOTH]**
- New **capability model**: a connector may declare `actions` (e.g. `redeploy`,
  `purge_cache`, `pause`, `create_issue`). The app renders them as guarded buttons.
- Every action requires: capability enabled on the instance + role ≥ editor +
  confirmation + an **audit-log** entry (who/what/when/result).
- Ships with a tiny, safe set first (Vercel redeploy, Cloudflare cache purge,
  GitHub issue create) — all in the connectors repo behind the SDK v2 action API.

### F. Team, tenancy & access **[APP]**
- **Multiple organizations** per instance; org switcher.
- **SSO/OIDC** login (self-hosted IdPs: Authentik, Keycloak, Google Workspace).
- **REST API keys** (separate from MCP tokens) for scripting/automation.
- **Audit log** for all writes and actions; exportable.
- Finer permissions (per-project roles) — optional, behind the existing RBAC guard.
- **Invitation emails over SMTP** (close the 1.0 follow-up; tokens are UI-only today).

### G. MCP & AI 2.0 **[APP]**
- **Write/action MCP tools** mirroring §E, same capability+RBAC+audit gating, so an
  AI agent can *propose* and (when permitted) *execute* portfolio actions safely.
- More resources: `portfolio://health`, `domain://{id}/dns`, `finance://summary`.
- **Natural-language metric queries** ("uptime of all live projects last 30 days").
- Semantic search over events/incidents (pgvector) for "have I seen this before?".

### H. Connector ecosystem 2.0 **[CONN]** + registry UI **[APP]**
- **SDK v2** (see §7): capabilities, actions, OAuth flows, incremental sync,
  pagination, schema-driven config UI, typed health.
- **Connector marketplace**: a browsable registry (metadata: id, vendor, auth type,
  capabilities, verified flag) surfaced in-app under "Add connector".
- **OAuth connector base** so vendors needing OAuth (not just API keys) are first-class.
- Connector **self-test** mode in the scaffolding CLI.

### I. Platform & operations **[APP]**
- **OpenTelemetry** traces/metrics/logs across api/worker/mcp.
- **Backup & restore** helper (pg_dump + secrets key) and a documented upgrade path.
- **One-click update** flow + version/health endpoint; optional Helm chart / k8s manifests.
- Worker observability: queue depth, connector latency, rate-limit budget dashboards.
- Data **export/import** (portfolio portability, GDPR).

---

## 5. Phased roadmap

Each milestone is independently shippable and demoable (the 1.0 discipline).

### M1 — Design System "Aurora" + App Shell **[APP]** — ✅ shipped
Component layer, tokens, left-rail shell, command palette, global search,
notification center, Recharts time-series, onboarding wizard, empty states,
a11y pass. *No new backend semantics — pure UX uplift + charts.*

Delivered: app shell (left rail + top bar + mobile drawer); Aurora component
layer (`components/ui.tsx`); command palette (⌘K) with project search; metrics
history API (`GET /api/metrics/history`) + `TimeSeriesChart` (Recharts) +
`Sparkline`; onboarding hero on the empty portfolio. Remaining nice-to-haves
folded into later passes: notification center, kanban sparkline wiring, deeper
a11y audit.

### M2 — Portfolio Intelligence + Notes/TODO **[APP]** — ✅ shipped
Portfolio Overview home, needs-attention queue, risk register, per-project
notes/TODO, weekly AI digest. Closes the biggest 1.0 follow-up.

Delivered: per-project notes & tasks (`project_notes` table + manage CRUD + UI);
Portfolio Overview band (health/spend stat tiles) with a "needs attention" risk
queue (down/degraded, SSL ≤14d, live-but-unmonitored, domain renewals ≤30d).
Deferred: weekly AI digest email (folded into M4 once SMTP invites land).

### M3 — FinOps 2.0 **[APP]** + first revenue connector **[CONN]** — 🟡 in progress
FX normalization, budgets/forecasts, profitability table, Stripe revenue
connector, renewal calendar export.

Delivered: Stripe revenue connector; Finance MRR + per-project profitability +
MRR on the Overview; **budgets** (project/tag/org) with overspend colour;
**iCal renewal calendar** export; **multi-currency FX normalization** (manual
base currency + rates → base-currency net banner).

### M4 — Incidents + Alerting 2.0 + SMTP invites **[APP]** — ✅ shipped (core)
Incident lifecycle, routing/escalation, maintenance windows, status page 2.0,
invitation emails.

Delivered: incident lifecycle (`incidents` table, open/acknowledged/resolved +
`/incidents` page, feeding the Overview risk queue); **maintenance windows**
(worker alert suppression while active + UI); **alert routing** (per-channel min
severity + tag filter, enforced in the worker, with a Settings channel manager);
**SMTP invitation emails** (graceful link fallback); **status page 2.0** (overall
status headline + public RSS feed); **time-based escalation** (open+unacked
incidents past a threshold are escalated once); **weekly portfolio digest**
(carried from M2). Deferred: status-page subscribers/custom domain, AI-written
digest copy (the digest ships as a plain summary; AI flavour is optional later).

### M5 — SDK v2 + Actions framework **[BOTH]** — ✅ shipped (core)
Capabilities/actions/OAuth in the SDK; audit log + action UI in the app; a safe
starter action set; MCP write tools.

Delivered: **audit log** (global interceptor records every mutating request +
admin view); **Connector SDK v2** actions interface (`ConnectorAction` +
`ActionResult`) with a first action (Vercel `redeploy`, destructive); **action
framework** in the app — per-instance capability grants (`enabled_actions`),
dispatch that enforces grant + RBAC + audit + input validation + timeline event,
and a project-page UI to grant/run actions; **MCP write tools**
(`list_connector_actions` + RBAC-gated `run_connector_action`, audited).
**connector marketplace metadata** (category/vendor/auth/verified/actions in the
catalog + picker). Verified live (run blocked before grant; dispatched after;
viewer MCP tokens can't run; enriched catalog). Deferred: full OAuth2 connector
flow (the `auth: oauth2` descriptor exists; the authorize/callback/refresh flow
needs a real provider to build against) and a dedicated marketplace page.

### M6 — Tenancy, SSO, Marketplace, Platform ops **[APP]** + connector wave **[CONN]** — 🟡 in progress
Multi-org, OIDC/SSO, REST API keys, connector marketplace UI, OpenTelemetry,
backup/restore, and a wave of new connectors (analytics, errors, registrars, CI).

Delivered: **REST API keys** (`wmk_…` Bearer, role-scoped, revocable, last-used
tracked; AuthGuard accepts them alongside session JWTs; Settings manager).
Remaining (need external systems/decisions to build & verify): multi-org
switcher, OIDC/SSO (real IdP), OpenTelemetry (collector), backup/restore + Helm,
data export/import.

> Ordering rationale: ship visible value early (M1–M2), monetizable depth next
> (M3), reliability (M4), then the architecturally heavy two-way shift (M5) once
> audit + RBAC + capabilities are in place, and finally scale-out (M6).

---

## 6. Architecture deltas

Still **poll → normalize → store → serve**. Additions:

- **Action path (new, explicit):** `UI/MCP → API (capability + RBAC + audit) →
  Worker action job → Connector.action() → external API → audit result`. Actions
  are queued (BullMQ), never run inline in a request, and are idempotency-keyed.
- **FX job**: a scheduled worker fetches daily rates → `fx_rates`; finance reads
  locally (same caching rule as metrics).
- **pgvector** extension for semantic event search (optional, AI-gated).
- **OIDC**: add an auth strategy alongside local passwords; sessions unchanged
  (JWT httpOnly cookie).
- **Multi-org**: `organizationId` already threads through the schema; 2.0 exposes
  it (org switcher, scoping) rather than assuming a single default org.

---

## 7. Connector SDK v2 (Apache repo)

The 1.0 connector is `{ id, configSchema, schedule, fetch, normalize }`. v2 is a
**superset** — existing connectors keep working; new fields are optional.

```ts
interface ConnectorV2 extends Connector {
  // Vendor + UX metadata for the marketplace.
  meta: { vendor: string; category: string; docsUrl?: string; verified?: boolean };

  // OAuth2 connectors (in addition to API-key config).
  auth?: { kind: "api_key" | "oauth2"; oauth?: OAuthConfig };

  // Incremental sync: return a cursor to avoid refetching everything.
  fetch(ctx: ConnectorContext & { cursor?: string }): Promise<RawData & { cursor?: string }>;

  // Two-way actions, each guarded by capability + RBAC + audit in the app.
  actions?: ConnectorAction[];

  // Typed health so the UI can render connector status richly.
  health?(ctx: ConnectorContext): Promise<ConnectorHealth>;
}

interface ConnectorAction {
  id: string;                 // "redeploy", "purge_cache"
  title: string;
  inputSchema: ZodSchema;     // renders a form + validates
  destructive?: boolean;      // forces an extra confirm
  run(ctx: ConnectorContext, input: unknown): Promise<ActionResult>;
}
```

Connectors-repo deliverables:
- SDK v2 types + runner support (cursors, OAuth token refresh, action dispatch).
- **Schema-driven config UI**: the app renders connector config forms from the
  Zod schema — no app code per connector.
- New connectors (priority order): **Stripe/Paddle/LemonSqueezy/Polar** (revenue),
  **Plausible/Umami/GA4** (analytics), **Sentry/BetterStack** (errors/uptime),
  **Netlify/Railway/Fly.io** (deploys), **Porkbun/Namecheap/Cloudflare Registrar**
  (domains), **GitHub Actions/GitLab CI** (pipelines), **Resend/Postmark** (email).
- `create-webmana-connector` CLI: scaffold v2 shape + `--with-action` + self-test.

The `connectorId`/`metricKind` open-slug rule and `webmana-connector-*`
auto-discovery are unchanged, so none of this requires forking the app.

---

## 8. Data model additions (Drizzle migrations)

New tables (org-scoped, cascade on delete) — names indicative:

- `project_notes` — markdown notes/TODO per project.
- `incidents` — lifecycle wrapper over `events` (status, owner, ack/resolve times).
- `audit_log` — actor, action, target, payload digest, result, timestamp.
- `budgets` — scope (project/tag/org), period, amount, currency.
- `fx_rates` — base, quote, rate, date.
- `revenue` — normalized MRR/revenue points (from revenue connectors).
- `dns_records` — last-seen records per domain (drift detection).
- `connector_capabilities` — enabled actions per connector instance.
- `api_keys` — REST API keys (hashed), role-scoped, separate from `mcp_tokens`.
- `organizations` gains `accent_color`, `base_currency`; add a real **org switcher**.

All additive; existing 1.0 tables and the metrics hypertable are untouched.

---

## 9. Repo split (AGPL app vs Apache connectors)

| Concern | Repo | License |
|---------|------|---------|
| Design system, app shell, all screens | `webmana` (app) | AGPL-3.0 |
| Portfolio intelligence, finance engine, incidents, alerting | `webmana` | AGPL-3.0 |
| Auth/RBAC/SSO, multi-org, audit, API keys, action orchestration | `webmana` | AGPL-3.0 |
| MCP server (read + guarded write tools) | `webmana` | AGPL-3.0 |
| Platform ops (OTel, backup, Helm) | `webmana` | AGPL-3.0 |
| `packages/contracts`, `packages/connectors` (**SDK v2**) | `webmana-connectors` | Apache-2.0 |
| All vendor connectors + OAuth base + action implementations | `webmana-connectors` | Apache-2.0 |
| Marketplace **metadata** (machine-readable registry) | `webmana-connectors` | Apache-2.0 |
| Marketplace **UI** that renders that metadata | `webmana` | AGPL-3.0 |

**Rule of thumb:** if it touches a vendor's API or auth, it lives in the Apache
connectors repo. If it's product UX, orchestration, or the data model, it lives in
the AGPL app. The **action *framework*** (capability + audit + RBAC + queue) is in
the app; the **action *implementations*** are in connectors.

---

## 10. Non-functional & quality

- **Testing**: unit tests for finance/FX, alert/incident logic, the action guard,
  and SDK v2 runner; Playwright smoke tests for the critical flows (login →
  create project → assign domain → connect connector → see data → run an action).
- **Security**: capability + RBAC + audit on every write/action; secrets stay
  encrypted at rest; OIDC; signed action requests; rate limiting on the REST API.
- **Performance**: dashboard reads stay local-only; charts use rollups, not raw
  points; command palette + search indexed.
- **Docs**: update `ARCHITECTURE.md` (action path, multi-org), a connector author
  guide for SDK v2, and an operator guide (backup, upgrade, SSO).
- **Migration/compat**: every change additive; v1 connectors run unmodified; a
  single `docker compose up` still works keyless.

---

## 11. Success criteria for 2.0

- New user reaches "first real data on the dashboard" in **< 5 minutes** (onboarding).
- Portfolio Overview answers "what needs my attention?" **without scrolling**.
- A community author ships a working connector against **SDK v2 in a day**, no app fork.
- At least one **safe two-way action** (e.g. Vercel redeploy) shipped end-to-end,
  fully audited and RBAC-gated.
- Finance shows **profit, not just cost**, in a single base currency.

---

## 12. Explicitly out of scope for 2.0

- Hosted/multi-tenant SaaS offering (the AGPL boundary stays self-host-first).
- Billing/payments *for Webmana itself*.
- Mobile native apps (PWA only).
- Arbitrary/unsandboxed remote code execution by connectors or AI.
- Replacing the locked stack (Next.js/NestJS/BullMQ/Postgres+Timescale/Drizzle/MCP).
```
