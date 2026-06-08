import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { DATABASE } from "../db/db.module.js";
import { hashPassword, signJwt, verifyPassword } from "./crypto.js";

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Seed an initial admin from env on first boot, if no users exist. */
  async onModuleInit(): Promise<void> {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return;

    const countRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users);
    if (Number(countRows[0]?.count ?? 0) > 0) return;

    // Ensure an organization exists, then create the admin + membership.
    let [org] = await this.db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .limit(1);
    if (!org) {
      [org] = await this.db
        .insert(schema.organizations)
        .values({ name: "Webmana", slug: "webmana" })
        .returning({ id: schema.organizations.id });
    }

    const [user] = await this.db
      .insert(schema.users)
      .values({ email, name: "Admin", passwordHash: hashPassword(password) })
      .returning({ id: schema.users.id });

    if (user && org) {
      await this.db
        .insert(schema.memberships)
        .values({ userId: user.id, organizationId: org.id, role: "admin" });
    }
    this.logger.log(`Seeded initial admin user: ${email}`);
  }

  /** Validate credentials and return a signed session JWT. */
  async login(email: string, password: string): Promise<{ token: string; role: string }> {
    const normalized = email?.trim().toLowerCase();
    if (!normalized || !password) {
      throw new UnauthorizedException("email and password are required");
    }

    const [user] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        passwordHash: schema.users.passwordHash,
        isActive: schema.users.isActive,
      })
      .from(schema.users)
      .where(eq(schema.users.email, normalized))
      .limit(1);

    if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException("invalid credentials");
    }

    // Resolve the user's role from their first membership (single-org MVP).
    const [membership] = await this.db
      .select({ role: schema.memberships.role })
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, user.id))
      .limit(1);
    const role = membership?.role ?? "viewer";

    const token = signJwt({ sub: user.id, email: user.email, role });
    return { token, role };
  }
}
