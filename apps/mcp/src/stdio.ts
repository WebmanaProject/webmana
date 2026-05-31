import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

/**
 * Local transport for a Cursor instance running on the same machine.
 * Role defaults to viewer for the local stdio session.
 */
async function main() {
  const server = createMcpServer({ role: "viewer" });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main();
