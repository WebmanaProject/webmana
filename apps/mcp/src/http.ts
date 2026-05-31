import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { type Request, type Response } from "express";
import { createDatabase } from "@webmana/db";
import { createMcpServer } from "./server.js";
import { resolveToken } from "./auth.js";

/**
 * Remote transport for AI clients (e.g. Cursor) over HTTP/SSE.
 * Authenticates with a Bearer token from the mcp_tokens table and scopes the
 * session to that token's org + role, so the AI inherits RBAC.
 */
const db = createDatabase(
  process.env.DATABASE_URL ?? "postgres://webmana:webmana@localhost:5432/webmana",
);

const transports = new Map<string, SSEServerTransport>();

function bearer(req: Request): string | undefined {
  const header = req.header("authorization");
  return header?.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : undefined;
}

const app = express();

app.get("/sse", async (req: Request, res: Response) => {
  const session = await resolveToken(db, bearer(req));
  if (!session) {
    res.status(401).json({ error: "invalid or missing bearer token" });
    return;
  }

  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);
  res.on("close", () => transports.delete(transport.sessionId));

  const server = createMcpServer({ db, ...session });
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
  console.log(`Webmana MCP (HTTP/SSE) listening on :${port}`);
});
