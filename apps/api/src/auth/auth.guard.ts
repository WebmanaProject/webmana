import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { readCookie, SESSION_COOKIE, verifyJwt, type JwtPayload } from "./crypto.js";
import { DATABASE } from "../db/db.module.js";

/** Minimal shape we read from the incoming HTTP request (Express-compatible). */
export interface AuthedRequest {
  headers: { authorization?: string; cookie?: string };
  user?: JwtPayload;
}

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/**
 * Authenticates a request via (in order): a session JWT (cookie or Bearer), or
 * a REST API key (`wmk_…` Bearer, looked up + role-scoped). Attaches req.user.
 * Protects all write/admin endpoints; RolesGuard then enforces the role.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7).trim()
      : null;

    // REST API key path (separate from session JWTs and MCP tokens).
    if (bearer?.startsWith("wmk_")) {
      const [key] = await this.db
        .select({
          id: schema.apiKeys.id,
          name: schema.apiKeys.name,
          role: schema.apiKeys.role,
        })
        .from(schema.apiKeys)
        .where(and(eq(schema.apiKeys.tokenHash, sha256(bearer)), isNull(schema.apiKeys.revokedAt)))
        .limit(1);
      if (!key) throw new UnauthorizedException("invalid or revoked API key");
      void this.db
        .update(schema.apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(schema.apiKeys.id, key.id))
        .catch(() => {});
      req.user = {
        sub: key.id,
        email: `apikey:${key.name}`,
        role: key.role,
        exp: Math.floor(Date.now() / 1000) + 60,
      };
      return true;
    }

    const token = bearer ?? readCookie(req.headers.cookie, SESSION_COOKIE);
    const payload = token ? verifyJwt(token) : null;
    if (!payload) throw new UnauthorizedException("authentication required");

    req.user = payload;
    return true;
  }
}
