import crypto from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import type { Role } from "@webmana/contracts";

export interface Session {
  role: Role;
  organizationId: string;
}

/** Tokens are stored hashed; we compare the sha256 hex of the presented value. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** The oldest organization — used to scope the local stdio session and dev token. */
export async function firstOrganizationId(db: Database): Promise<string | null> {
  const [row] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .orderBy(schema.organizations.createdAt)
    .limit(1);
  return row?.id ?? null;
}

/**
 * Resolve a bearer token to a session. Looks up a non-revoked row in
 * mcp_tokens by token hash and scopes to its org + role, recording lastUsedAt.
 * Falls back to MCP_DEV_TOKEN (viewer on the first org) for local development.
 */
export async function resolveToken(
  db: Database,
  token: string | undefined,
): Promise<Session | null> {
  if (!token) return null;

  const [row] = await db
    .select({
      id: schema.mcpTokens.id,
      role: schema.mcpTokens.role,
      organizationId: schema.mcpTokens.organizationId,
    })
    .from(schema.mcpTokens)
    .where(
      and(
        eq(schema.mcpTokens.tokenHash, hashToken(token)),
        isNull(schema.mcpTokens.revokedAt),
      ),
    )
    .limit(1);

  if (row) {
    await db
      .update(schema.mcpTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.mcpTokens.id, row.id));
    return { role: row.role, organizationId: row.organizationId };
  }

  // Dev-only fallback so local setups work before any token is provisioned.
  const devToken = process.env.MCP_DEV_TOKEN;
  if (devToken && token === devToken) {
    const organizationId = await firstOrganizationId(db);
    if (organizationId) return { role: "viewer", organizationId };
  }

  return null;
}
