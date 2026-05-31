import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDatabase } from "@webmana/db";
import { createMcpServer } from "./server.js";
import { firstOrganizationId } from "./auth.js";

/**
 * Local transport for an AI client running on the same machine. The local
 * session is trusted: it gets admin role, scoped to MCP_STDIO_ORG_ID if set,
 * otherwise the first organization.
 */
async function main() {
  const db = createDatabase(
    process.env.DATABASE_URL ?? "postgres://webmana:webmana@localhost:5432/webmana",
  );

  const organizationId =
    process.env.MCP_STDIO_ORG_ID ?? (await firstOrganizationId(db));
  if (!organizationId) {
    throw new Error("no organization found — create one before running the MCP stdio server");
  }

  const server = createMcpServer({ db, role: "admin", organizationId });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main();
