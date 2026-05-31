import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Role } from "@webmana/contracts";

export interface McpContext {
  /** Role this session is scoped to. AI inherits RBAC, never bypasses it. */
  role: Role;
}

/**
 * Builds an MCP server exposing read-only Webmana data.
 * Phase 0 registers placeholder tools; Phase 3 wires them to @webmana/db
 * reads, filtered through the shared RBAC guard using ctx.role.
 */
export function createMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer({
    name: "webmana",
    version: "0.0.0",
  });

  server.tool(
    "list_projects",
    "List projects (domains) visible to this token.",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { role: ctx.role, projects: [], note: "Phase 0 placeholder" },
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.tool(
    "get_project_health",
    "Get the aggregated health for a project.",
    { projectId: z.string().uuid() },
    async ({ projectId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { projectId, band: "unknown", note: "Phase 0 placeholder" },
            null,
            2,
          ),
        },
      ],
    }),
  );

  return server;
}
