import nodemailer, { type Transporter } from "nodemailer";
import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Weekly digest cadence (7 days). */
export function digestIntervalMs(): number {
  return 7 * DAY_MS;
}

/**
 * Compose a plain-text weekly digest for an org: portfolio size, active
 * incidents, and domains renewing in the next 30 days. Pure over the DB so it
 * can be tested and logged even without email configured.
 */
export async function composeDigest(db: Database, organizationId: string, now: Date): Promise<string> {
  const projectRows = await db
    .select({ id: schema.projects.id, name: schema.projects.name, status: schema.projects.status })
    .from(schema.projects)
    .where(eq(schema.projects.organizationId, organizationId));
  const live = projectRows.filter((p) => p.status === "live" || p.status === "rebuild").length;

  const activeIncidents = await db
    .select({ title: schema.incidents.title, severity: schema.incidents.severity, status: schema.incidents.status })
    .from(schema.incidents)
    .where(and(eq(schema.incidents.organizationId, organizationId), ne(schema.incidents.status, "resolved")))
    .orderBy(asc(schema.incidents.createdAt));

  const soon = new Date(now.getTime() + 30 * DAY_MS).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const renewals = await db
    .select({ fqdn: schema.domains.fqdn, expiresAt: schema.domains.expiresAt })
    .from(schema.domains)
    .where(
      and(
        eq(schema.domains.organizationId, organizationId),
        gte(schema.domains.expiresAt, today),
        lte(schema.domains.expiresAt, soon),
      ),
    )
    .orderBy(asc(schema.domains.expiresAt));

  const lines = [
    `Webmana weekly digest — ${today}`,
    "",
    `Projects: ${projectRows.length} (${live} live)`,
    `Active incidents: ${activeIncidents.length}`,
    ...activeIncidents.slice(0, 10).map((i) => `  • [${i.severity}] ${i.title} (${i.status})`),
    `Domains renewing in 30 days: ${renewals.length}`,
    ...renewals.slice(0, 15).map((r) => `  • ${r.fqdn} — ${r.expiresAt}`),
    "",
    "— Webmana",
  ];
  return lines.join("\n");
}

let cachedTransport: Transporter | null = null;
function getTransport(): Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  if (cachedTransport) return cachedTransport;
  const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  return cachedTransport;
}

/**
 * Build and deliver the weekly digest for every org to its email alert
 * channels. Always logs the digest; emails only when SMTP is configured.
 * Returns the number of emails sent.
 */
export async function sendWeeklyDigest(db: Database, now: Date): Promise<number> {
  const orgs = await db.select({ id: schema.organizations.id }).from(schema.organizations);
  const transport = getTransport();
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
  let sent = 0;

  for (const org of orgs) {
    const digest = await composeDigest(db, org.id, now);
    console.log(`[digest] org ${org.id}:\n${digest}`);
    if (!transport || !from) continue;

    const emailChannels = await db
      .select({ config: schema.alertChannels.config })
      .from(schema.alertChannels)
      .where(
        and(
          eq(schema.alertChannels.organizationId, org.id),
          eq(schema.alertChannels.kind, "email"),
          eq(schema.alertChannels.enabled, true),
        ),
      );
    for (const c of emailChannels) {
      const to = (c.config as Record<string, unknown>).to;
      if (typeof to !== "string" || !to) continue;
      try {
        await transport.sendMail({ from, to, subject: "Webmana weekly digest", text: digest });
        sent += 1;
      } catch (err) {
        console.error("[digest] email failed:", err instanceof Error ? err.message : String(err));
      }
    }
  }
  return sent;
}
