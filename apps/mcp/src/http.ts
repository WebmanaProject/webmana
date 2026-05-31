import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { type Request, type Response } from "express";
import type { Role } from "@webmana/contracts";
import { createMcpServer } from "./server.js";

/**
 * Remote transport for AI clients (e.g. Cursor) over HTTP/SSE.
 * Authenticates with a Bearer token from the mcp_tokens table and scopes the
 * session to that token's role. Phase 0 stubs token lookup; Phase 3 wires it
 * to @webmana/db and the shared RBAC guard.
 */
const transports = new Map<string, SSEServerTransport>();

async function resolveRole(token: string | undefined): Promise<Role | null> {
  // Phase 0 stub: accept a dev token from env, scope to viewer.
  if (token && token === process.env.MCP_DEV_TOKEN) return "viewer";
  return null;
}

function bearer(req: Request): string | undefined {
  const header = req.header("authorization");
  return header?.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : undefined;
}

const app = express();

app.get("/sse", async (req: Request, res: Response) => {
  const role = await resolveRole(bearer(req));
  if (!role) {
    res.status(401).json({ error: "invalid or missing bearer token" });
    return;
  }

  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);
  res.on("close", () => transports.delete(transport.sessionId));

  const server = createMcpServer({ role });
  await server.connect(transport);
});

app.post("/messages", async (req: Request, res: Response) => {
  const sessionId = String(req.query.sessionId ?? "");
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: "unknown session" });
    return;
  }
  await transport.handlePostMessage(req, res);
});

const port = Number(process.env.MCP_PORT ?? 4100);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Webmana MCP (HTTP/SSE) listening on :${port}`);
});
