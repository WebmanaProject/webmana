import { sql } from "drizzle-orm";
import {
  boolean,
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
export const severityEnum = pgEnum("event_severity", ["info", "warning", "critical"]);
export const syncStatusEnum = pgEnum("connector_sync_status", ["ok", "error", "running"]);
export const alertChannelKindEnum = pgEnum("alert_channel_kind", [
  "webhook",
  "slack",
  "email",
]);

/* ----------------------------------------------------------------- RBAC ---- */

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

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
    /** Primary domain, e.g. "example.com". */
    domain: text("domain").notNull(),
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
