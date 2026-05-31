import { z } from "zod";

/** RBAC roles. A single guard enforces these across the API and the MCP server. */
export const roleSchema = z.enum(["admin", "editor", "viewer"]);
export type Role = z.infer<typeof roleSchema>;

/** Identifiers for built-in and external connectors. */
export const connectorIdSchema = z.enum([
  // keyless built-ins (Phase 1)
  "ssl",
  "whois",
  "dns",
  "uptime",
  // API connectors (Phase 2+)
  "cloudflare",
  "pagespeed",
  "uptimerobot",
  "ga4",
  "observatory",
  "datadog",
  "elasticsearch",
  "snyk",
  "aws_cost",
]);
export type ConnectorId = z.infer<typeof connectorIdSchema>;

/** Categories used to group metrics/connectors in the UI. */
export const metricKindSchema = z.enum([
  "uptime",
  "performance",
  "ssl",
  "dns",
  "whois",
  "security",
  "cost",
  "traffic",
]);
export type MetricKind = z.infer<typeof metricKindSchema>;

/** A single normalized time-series point produced by a connector's normalize(). */
export const normalizedMetricSchema = z.object({
  projectId: z.string().uuid(),
  connectorId: connectorIdSchema,
  kind: metricKindSchema,
  /** Dotted metric name, e.g. "ssl.days_until_expiry" or "uptime.ratio". */
  name: z.string().min(1),
  value: z.number(),
  unit: z.string().optional(),
  /** Free-form low-cardinality labels (e.g. region, endpoint). */
  labels: z.record(z.string()).optional(),
  observedAt: z.coerce.date(),
});
export type NormalizedMetric = z.infer<typeof normalizedMetricSchema>;

/** Unified timeline event / incident. */
export const eventSeveritySchema = z.enum(["info", "warning", "critical"]);
export type EventSeverity = z.infer<typeof eventSeveritySchema>;

export const projectEventSchema = z.object({
  projectId: z.string().uuid(),
  connectorId: connectorIdSchema.optional(),
  severity: eventSeveritySchema,
  title: z.string().min(1),
  description: z.string().optional(),
  occurredAt: z.coerce.date(),
});
export type ProjectEvent = z.infer<typeof projectEventSchema>;

/** Result of a single connector run, recorded for observability. */
export const connectorSyncStatusSchema = z.enum(["ok", "error", "running"]);
export type ConnectorSyncStatus = z.infer<typeof connectorSyncStatusSchema>;

/** Health score buckets surfaced in the dashboard. */
export const healthBandSchema = z.enum(["healthy", "degraded", "down", "unknown"]);
export type HealthBand = z.infer<typeof healthBandSchema>;

export interface HealthInput {
  /** Latest sync status per connector instance on the project. */
  connectors: { lastSyncStatus: string | null }[];
  /** Count of critical events within the caller's "recent" window. */
  recentCriticalCount: number;
  /** Count of warning events within the caller's "recent" window. */
  recentWarningCount: number;
}

/**
 * Derive a project's health band from connector sync statuses and recent
 * event severity. Pure and window-agnostic: the caller decides what "recent"
 * means and passes the counts.
 */
export function computeHealthBand(input: HealthInput): HealthBand {
  const statuses = input.connectors.map((c) => c.lastSyncStatus);
  if (statuses.length === 0 || statuses.every((s) => s == null)) return "unknown";
  if (statuses.includes("error") || input.recentCriticalCount > 0) return "down";
  if (input.recentWarningCount > 0 || statuses.some((s) => s !== "ok")) {
    return "degraded";
  }
  return "healthy";
}
