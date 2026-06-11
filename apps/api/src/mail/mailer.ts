import nodemailer, { type Transporter } from "nodemailer";

let cached: Transporter | null = null;

/** True when SMTP is configured via env (so the app can send mail). */
export function isMailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

/** Build (and cache) the SMTP transport from environment configuration. */
function transport(): Transporter {
  if (cached) return cached;
  const host = process.env.SMTP_HOST;
  if (!host) throw new Error("SMTP_HOST not configured");
  const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
  cached = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  return cached;
}

/**
 * Send an invitation email. Returns true if sent. No-ops (returns false) when
 * SMTP is unconfigured, so the caller can fall back to showing the link — the
 * self-hosted default works with zero mail setup.
 */
export async function sendInviteEmail(to: string, link: string, role: string): Promise<boolean> {
  if (!isMailConfigured()) return false;
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "webmana@localhost";
  await transport().sendMail({
    from,
    to,
    subject: "You've been invited to Webmana",
    text: `You've been invited to join a Webmana organization as ${role}.\n\nAccept the invitation:\n${link}\n\nThis link expires in 7 days.`,
    html:
      `<p>You've been invited to join a Webmana organization as <b>${role}</b>.</p>` +
      `<p><a href="${link}">Accept the invitation</a></p>` +
      `<p style="color:#888;font-size:12px">This link expires in 7 days.</p>`,
  });
  return true;
}
