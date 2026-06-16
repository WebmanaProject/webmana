import { Inject, Injectable } from "@nestjs/common";
import { desc } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { DATABASE } from "../db/db.module.js";

export interface AuditEntryInput {
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  method: string;
  path: string;
  targetId: string | null;
  statusCode: number;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Append an audit entry. Best-effort: never throws into the request path. */
  async record(entry: AuditEntryInput): Promise<void> {
    try {
      await this.db.insert(schema.auditLog).values(entry);
    } catch (err) {
      console.error("[audit] failed to record:", err instanceof Error ? err.message : String(err));
    }
  }

  /** Most recent audit entries (newest first), paginated. */
  async list(limit = 100, offset = 0) {
    const rows = await this.db
      .select()
      .from(schema.auditLog)
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(Math.min(Math.max(limit, 1), 500))
      .offset(Math.max(offset, 0));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }
}
