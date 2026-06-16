import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Role } from "@webmana/contracts";
import type { Database } from "@webmana/db";
import {
  getProject,
  getProjectInsight,
  getSlaReport,
  listProjects,
  listRecentEvents,
} from "./queries.js";
import { listConnectorActions, runConnectorAction } from "./actions.js";

export interface McpContext {
  db: Database;
  /** Role this session is scoped to. AI inherits RBAC, never bypasses it. */
  role: Role;
  /** Organization this token belongs to; all reads are scoped to it. */
  organizationId: string;
}

function json(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

/** Builds an MCP server exposing read-only Webmana data scoped to one org. */
export function createMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer({ name: "webmana", version: "0.1.0" });

  server.tool(
    "list_projects",
    "List all projects (domains) visible to this token, each with its tags and connector sync status. Optionally filter by tag.",
    { tag: z.string().min(1).optional() },
    async ({ tag }) => json(await listProjects(ctx.db, ctx.organizationId, tag)),
  );

  server.tool(
    "get_project",
    "Get full detail for one project: connectors with sync status, the latest value of each metric, and recent events.",
    { projectId: z.string().uuid() },
    async ({ projectId }) => {
      const project = await getProject(ctx.db, ctx.organizationId, projectId);
      if (!project) {
        return json({ error: "project not found or not visible to this token" });
      }
      return json(project);
    },
  );

  server.tool(
    "list_recent_events",
    "List recent events/incidents across all visible projects, newest first. Optionally filter by severity.",
    {
      severity: z.enum(["info", "warning", "critical"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ severity, limit }) =>
      json(await listRecentEvents(ctx.db, ctx.organizationId, { severity, limit })),
  );

  server.tool(
    "get_sla_report",
    "Uptime SLA per visible project over a trailing window: uptime percentage, sample count, and down samples. windowDays defaults to 30 (max 365).",
    { windowDays: z.number().int().min(1).max(365).optional() },
    async ({ windowDays }) =>
      json(await getSlaReport(ctx.db, ctx.organizationId, windowDays)),
  );

  server.tool(
    "get_project_insight",
    "Get the latest AI-generated health summary for a project (model + timestamp). Returns an error object when none has been generated.",
    { projectId: z.string().uuid() },
    async ({ projectId }) => {
      const insight = await getProjectInsight(ctx.db, ctx.organizationId, projectId);
      if (!insight) {
        return json({ error: "no insight available for this project yet" });
      }
      return json(insight);
    },
  );

  /* ---------------------------------------------------------- Actions ----- */

  server.tool(
    "list_connector_actions",
    "List a project's connectors with the two-way actions they expose and which are enabled (granted) for use. Use before run_connector_action to discover ids.",
    { projectId: z.string().uuid() },
    async ({ projectId }) => json(await listConnectorActions(ctx.db, ctx.organizationId, projectId)),
  );

  // Write tool: only editor/admin tokens may run actions (viewer is read-only).
  if (ctx.role !== "viewer") {
    server.tool(
      "run_connector_action",
      "Run an enabled connector action (a real, possibly side-effecting operation, e.g. a redeploy). The action must already be granted on the connector; viewer tokens cannot call this. Returns the action result.",
      {
        projectId: z.string().uuid(),
        connectorInstanceId: z.string().uuid(),
        actionId: z.string().min(1),
        input: z.record(z.unknown()).optional(),
      },
      async ({ projectId, connectorInstanceId, actionId, input }) =>
        json(
          await runConnectorAction(ctx.db, ctx.organizationId, ctx.role, {
            projectId,
            connectorInstanceId,
            actionId,
            input,
          }),
        ),
    );
  }

  return server;
}
