import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Role } from "@webmana/contracts";
import type { Database } from "@webmana/db";
import { getProject, listProjects, listRecentEvents } from "./queries.js";

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
  const server = new McpServer({ name: "webmana", version: "0.0.0" });

  server.tool(
    "list_projects",
    "List all projects (domains) visible to this token, each with its connector sync status.",
    {},
    async () => json(await listProjects(ctx.db, ctx.organizationId)),
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

  return server;
}
