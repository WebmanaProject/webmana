import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { hashPassword } from "../auth/crypto.js";
import { DATABASE } from "../db/db.module.js";
import { sendInviteEmail } from "../mail/mailer.js";

type Role = "admin" | "editor" | "viewer";
const ROLES: Role[] = ["admin", "editor", "viewer"];

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class OrgService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private async defaultOrgId(): Promise<string> {
    const [org] = await this.db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .orderBy(schema.organizations.createdAt)
      .limit(1);
    if (!org) throw new BadRequestException("no organization exists");
    return org.id;
  }

  /** Members of the org with their role. */
  async listMembers(): Promise<{ userId: string; email: string; name: string | null; role: string }[]> {
    const orgId = await this.defaultOrgId();
    return this.db
      .select({
        userId: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.memberships.role,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(eq(schema.memberships.organizationId, orgId));
  }

  async changeRole(userId: string, role: string): Promise<void> {
    if (!ROLES.includes(role as Role)) throw new BadRequestException("invalid role");
    const orgId = await this.defaultOrgId();
    const updated = await this.db
      .update(schema.memberships)
      .set({ role: role as Role })
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.organizationId, orgId),
        ),
      )
      .returning({ userId: schema.memberships.userId });
    if (updated.length === 0) throw new NotFoundException("member not found");
  }

  /**
   * Create an invitation. Emails the link when SMTP is configured; always
   * returns the plaintext token (shown once) so the link still works without mail.
   */
  async invite(email: string, role: string): Promise<{ token: string; email: string; emailed: boolean }> {
    const normalized = email?.trim().toLowerCase();
    if (!normalized) throw new BadRequestException("email is required");
    if (!ROLES.includes(role as Role)) throw new BadRequestException("invalid role");
    const orgId = await this.defaultOrgId();

    const token = randomBytes(24).toString("base64url");
    await this.db.insert(schema.invitations).values({
      organizationId: orgId,
      email: normalized,
      role: role as Role,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });

    const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
    const link = `${origin}/invite?token=${token}`;
    let emailed = false;
    try {
      emailed = await sendInviteEmail(normalized, link, role);
    } catch (err) {
      // Mail failure must not block invite creation — the link still works.
      console.error("[org] invite email failed:", err instanceof Error ? err.message : String(err));
    }
    return { token, email: normalized, emailed };
  }

  /** Pending (unaccepted, unexpired) invitations. */
  async listInvitations(): Promise<{ email: string; role: string; expiresAt: string }[]> {
    const orgId = await this.defaultOrgId();
    const rows = await this.db
      .select({
        email: schema.invitations.email,
        role: schema.invitations.role,
        expiresAt: schema.invitations.expiresAt,
      })
      .from(schema.invitations)
      .where(
        and(
          eq(schema.invitations.organizationId, orgId),
          isNull(schema.invitations.acceptedAt),
        ),
      );
    return rows.map((r) => ({ ...r, expiresAt: r.expiresAt.toISOString() }));
  }

  /** Accept an invitation: create the user + membership. Public (token-gated). */
  async accept(token: string, name: string, password: string): Promise<void> {
    if (!token || !password) throw new BadRequestException("token and password required");
    const [invite] = await this.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.tokenHash, sha256(token)))
      .limit(1);
    if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("invitation is invalid or expired");
    }

    const [existing] = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, invite.email))
      .limit(1);
    if (existing) throw new BadRequestException("a user with this email already exists");

    const [user] = await this.db
      .insert(schema.users)
      .values({
        email: invite.email,
        name: name?.trim() || null,
        passwordHash: hashPassword(password),
      })
      .returning({ id: schema.users.id });
    if (!user) throw new BadRequestException("failed to create user");

    await this.db.insert(schema.memberships).values({
      userId: user.id,
      organizationId: invite.organizationId,
      role: invite.role,
    });
    await this.db
      .update(schema.invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(schema.invitations.id, invite.id));
  }

  /* ------------------------------------------------------------ MCP tokens -- */

  async listMcpTokens(): Promise<{ id: string; name: string; role: string; createdAt: string }[]> {
    const orgId = await this.defaultOrgId();
    const rows = await this.db
      .select({
        id: schema.mcpTokens.id,
        name: schema.mcpTokens.name,
        role: schema.mcpTokens.role,
        createdAt: schema.mcpTokens.createdAt,
      })
      .from(schema.mcpTokens)
      .where(eq(schema.mcpTokens.organizationId, orgId));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  /** Create an MCP token; returns the plaintext token (shown once). */
  async createMcpToken(name: string, role: string): Promise<{ token: string }> {
    if (!name?.trim()) throw new BadRequestException("name is required");
    if (!ROLES.includes(role as Role)) throw new BadRequestException("invalid role");
    const orgId = await this.defaultOrgId();
    const token = `wm_${randomBytes(24).toString("base64url")}`;
    await this.db.insert(schema.mcpTokens).values({
      organizationId: orgId,
      name: name.trim(),
      tokenHash: sha256(token),
      role: role as Role,
    });
    return { token };
  }

  async revokeMcpToken(id: string): Promise<void> {
    const orgId = await this.defaultOrgId();
    const deleted = await this.db
      .delete(schema.mcpTokens)
      .where(and(eq(schema.mcpTokens.id, id), eq(schema.mcpTokens.organizationId, orgId)))
      .returning({ id: schema.mcpTokens.id });
    if (deleted.length === 0) throw new NotFoundException("token not found");
  }

  /* ------------------------------------------------------------- API keys -- */

  async listApiKeys(): Promise<{ id: string; name: string; role: string; lastUsedAt: string | null; createdAt: string }[]> {
    const orgId = await this.defaultOrgId();
    const rows = await this.db
      .select({
        id: schema.apiKeys.id,
        name: schema.apiKeys.name,
        role: schema.apiKeys.role,
        lastUsedAt: schema.apiKeys.lastUsedAt,
        revokedAt: schema.apiKeys.revokedAt,
        createdAt: schema.apiKeys.createdAt,
      })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.organizationId, orgId));
    return rows
      .filter((r) => !r.revokedAt)
      .map((r) => ({
        id: r.id,
        name: r.name,
        role: r.role,
        lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }));
  }

  /** Create a REST API key; returns the plaintext key (shown once). */
  async createApiKey(name: string, role: string): Promise<{ key: string }> {
    if (!name?.trim()) throw new BadRequestException("name is required");
    if (!ROLES.includes(role as Role)) throw new BadRequestException("invalid role");
    const orgId = await this.defaultOrgId();
    const key = `wmk_${randomBytes(24).toString("base64url")}`;
    await this.db.insert(schema.apiKeys).values({
      organizationId: orgId,
      name: name.trim(),
      tokenHash: sha256(key),
      role: role as Role,
    });
    return { key };
  }

  async revokeApiKey(id: string): Promise<void> {
    const orgId = await this.defaultOrgId();
    const updated = await this.db
      .update(schema.apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.organizationId, orgId)))
      .returning({ id: schema.apiKeys.id });
    if (updated.length === 0) throw new NotFoundException("api key not found");
  }
}
