import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["admin", "editor", "viewer"]);
export const projectStatusEnum = pgEnum("project_status", [
  "idea",
  "in_progress",
  "rebuild",
  "live",
  "paused",
  "archived",
]);
export const severityEnum = pgEnum("event_severity", ["info", "warning", "critical"]);
export const syncStatusEnum = pgEnum("connector_sync_status", ["ok", "error", "running"]);
export const alertChannelKindEnum = pgEnum("alert_channel_kind", [
  "webhook",
  "slack",
  "email",
]);
export const budgetScopeEnum = pgEnum("budget_scope", ["project", "tag", "org"]);
export const budgetPeriodEnum = pgEnum("budget_period", ["monthly", "annual"]);
export const incidentStatusEnum = pgEnum("incident_status", [
  "open",
  "acknowledged",
  "resolved",
]);

/* ----------------------------------------------------------------- RBAC ---- */

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** Reporting currency totals are normalized into (ISO code, e.g. "USD"). */
  baseCurrency: text("base_currency").notNull().default("USD"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Manual FX rates: 1 unit of `currency` = `rateToBase` units of the org base. */
export const fxRates = pgTable(
  "fx_rates",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** ISO code of the foreign currency, e.g. "PLN". */
    currency: text("currency").notNull(),
    /** How many base-currency units one `currency` unit is worth. */
    rateToBase: doublePrecision("rate_to_base").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("fx_rates_org_currency_idx").on(t.organizationId, t.currency)],
);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A user's role within an organization. */
export const memberships = pgTable(
  "memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("viewer"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.organizationId] })],
);

/* ------------------------------------------------------------- Projects ---- */

export const projects = pgTable(
  "projects",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Primary domain, e.g. "example.com". Null for ideas/early-stage projects. */
    domain: text("domain"),
    /** Lifecycle status. Monitoring runs only for live/rebuild projects. */
    status: projectStatusEnum("status").notNull().default("idea"),
    /** Free-form description / notes. */
    description: text("description"),
    /** Useful links: { repo, prod, staging, design, ... }. */
    links: jsonb("links").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_org_idx").on(t.organizationId)],
);

export const projectTags = pgTable(
  "project_tags",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.tag] })],
);

/* -------------------------------------------------------------- Domains ---- */
/**
 * A registered domain as a first-class asset, independent of projects. One
 * project may use several domains (primary + aliases + ccTLDs), and a domain may
 * be parked with no project. Registry/expiry data can be entered manually or
 * refreshed by a WHOIS connector.
 */
export const domains = pgTable(
  "domains",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Fully-qualified domain name, e.g. "example.com". Unique per org. */
    fqdn: text("fqdn").notNull(),
    registrar: text("registrar"),
    /** Expiry date (manual or WHOIS-sourced). Drives renewal alerts. */
    expiresAt: date("expires_at"),
    autoRenew: boolean("auto_renew").notNull().default(false),
    /** Nameservers as a JSON array of strings. */
    nameservers: jsonb("nameservers").notNull().default(sql`'[]'::jsonb`),
    /** Registry/transfer lock engaged. */
    locked: boolean("locked").notNull().default(false),
    /** Finance (manual): one-time purchase price + annual renewal cost. */
    purchaseCost: doublePrecision("purchase_cost"),
    renewalCost: doublePrecision("renewal_cost"),
    /** ISO currency code for the cost fields, e.g. "USD", "PLN". */
    costCurrency: text("cost_currency"),
    /** When the domain was first registered/bought. */
    purchaseDate: date("purchase_date"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("domains_org_fqdn_idx").on(t.organizationId, t.fqdn),
    index("domains_expires_idx").on(t.expiresAt),
  ],
);

/** Many-to-many link between projects and domains. */
export const projectDomains = pgTable(
  "project_domains",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    /** True for the project's main domain (at most one should be primary). */
    primary: boolean("primary").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.domainId] })],
);

/** AI-generated natural-language summaries, produced during scheduled syncs. */
export const projectInsights = pgTable(
  "project_insights",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The generated summary text. */
    summary: text("summary").notNull(),
    /** Model identifier that produced the summary, e.g. "claude-3-5-haiku". */
    model: text("model").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("project_insights_project_time_idx").on(t.projectId, t.generatedAt)],
);

/** Free-form notes and checklist items attached to a project. */
export const projectNotes = pgTable(
  "project_notes",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Note / task text (plain text or simple markdown). */
    body: text("body").notNull(),
    /** Checklist state. A task that is checked off; notes default to false. */
    done: boolean("done").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("project_notes_project_idx").on(t.projectId, t.createdAt)],
);

/* ----------------------------------------------------------- Connectors ---- */

export const connectorInstances = pgTable(
  "connector_instances",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Connector id, e.g. "ssl", "cloudflare". Validated against contracts in app code. */
    connectorId: text("connector_id").notNull(),
    /** Non-secret connector settings. */
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    /** Secret credentials, ENCRYPTED AT REST by the app layer (never plaintext). */
    encryptedSecrets: text("encrypted_secrets"),
    enabled: boolean("enabled").notNull().default(true),
    lastSyncStatus: syncStatusEnum("last_sync_status"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncError: text("last_sync_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("connector_instances_project_idx").on(t.projectId),
    uniqueIndex("connector_instances_project_connector_idx").on(
      t.projectId,
      t.connectorId,
    ),
  ],
);

/* -------------------------------------------------------------- Metrics ---- */
/** Time-series. Promoted to a TimescaleDB hypertable in migration SQL. */
export const metrics = pgTable(
  "metrics",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    connectorId: text("connector_id").notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    value: doublePrecision("value").notNull(),
    unit: text("unit"),
    labels: jsonb("labels"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("metrics_project_name_time_idx").on(t.projectId, t.name, t.observedAt),
  ],
);

/* --------------------------------------------------------------- Events ---- */

export const events = pgTable(
  "events",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    connectorId: text("connector_id"),
    severity: severityEnum("severity").notNull().default("info"),
    title: text("title").notNull(),
    description: text("description"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("events_project_time_idx").on(t.projectId, t.occurredAt)],
);

/* -------------------------------------------------------------- Alerts ----- */

export const alertChannels = pgTable("alert_channels", {
  id: id(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  kind: alertChannelKindEnum("kind").notNull(),
  /** Channel target config (webhook URL, Slack webhook, email address). */
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
  enabled: boolean("enabled").notNull().default(true),
  /** Routing: only deliver alerts at or above this severity. */
  minSeverity: severityEnum("min_severity").notNull().default("info"),
  /** Routing: when set, only deliver alerts for projects carrying this tag. */
  tagFilter: text("tag_filter"),
  createdAt: createdAt(),
});

export const alertRules = pgTable(
  "alert_rules",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Metric name this rule watches, e.g. "ssl.days_until_expiry". */
    metricName: text("metric_name").notNull(),
    /** Comparison operator: lt, lte, gt, gte, eq. */
    operator: text("operator").notNull(),
    threshold: doublePrecision("threshold").notNull(),
    severity: severityEnum("severity").notNull().default("warning"),
    /** Minimum seconds between repeat notifications. */
    cooldownSeconds: doublePrecision("cooldown_seconds").notNull().default(3600),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("alert_rules_project_idx").on(t.projectId)],
);

export const alertHistory = pgTable(
  "alert_history",
  {
    id: id(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => alertRules.id, { onDelete: "cascade" }),
    firedAt: timestamp("fired_at", { withTimezone: true }).notNull().defaultNow(),
    value: doublePrecision("value").notNull(),
    delivered: boolean("delivered").notNull().default(false),
  },
  (t) => [index("alert_history_rule_time_idx").on(t.ruleId, t.firedAt)],
);

/* -------------------------------------------------------------- Budgets ---- */
/** A spending budget scoped to a project, a tag, or the whole org. */
export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    scope: budgetScopeEnum("scope").notNull(),
    /** Project id (scope=project) or tag (scope=tag); null for the whole org. */
    ref: text("ref"),
    period: budgetPeriodEnum("period").notNull().default("monthly"),
    amount: doublePrecision("amount").notNull(),
    /** ISO currency code, e.g. "USD". */
    currency: text("currency").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("budgets_org_idx").on(t.organizationId)],
);

/* ------------------------------------------------------------ Incidents ---- */
/** A tracked incident with an ack/resolve lifecycle (org- or project-scoped). */
export const incidents = pgTable(
  "incidents",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Optional project this incident relates to; null for org-wide. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    severity: severityEnum("severity").notNull().default("warning"),
    status: incidentStatusEnum("status").notNull().default("open"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** Set once when a stale unacknowledged incident has been escalated. */
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("incidents_org_status_idx").on(t.organizationId, t.status, t.createdAt)],
);

/** A planned maintenance window that suppresses alerts while active. */
export const maintenanceWindows = pgTable(
  "maintenance_windows",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Target project; null suppresses alerts org-wide. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    reason: text("reason"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("maintenance_org_idx").on(t.organizationId, t.startsAt)],
);

/* --------------------------------------------------------- Invitations ----- */
/** Pending invitations to join an organization with a given role. */
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull().default("viewer"),
    /** Hashed invite token; the plaintext is delivered to the invitee once. */
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_org_idx").on(t.organizationId)],
);

/* ----------------------------------------------------------- MCP tokens ---- */
/** Tokens for MCP HTTP/SSE clients. Scoped to a role so AI inherits RBAC. */
export const mcpTokens = pgTable("mcp_tokens", {
  id: id(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Hash of the token; the plaintext is shown once at creation. */
  tokenHash: text("token_hash").notNull().unique(),
  role: roleEnum("role").notNull().default("viewer"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});
