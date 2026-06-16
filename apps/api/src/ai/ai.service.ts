import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";
import { encryptSecrets, decryptSecrets } from "@webmana/crypto";
import { DATABASE } from "../db/db.module.js";

/** Public (sanitized) view of the AI settings — never includes the key. */
export interface AiSettingsView {
  provider: "anthropic" | "openai";
  baseUrl: string | null;
  model: string | null;
  enabled: boolean;
  hasKey: boolean;
  defaultModel: string;
}

export interface SaveAiSettingsInput {
  provider?: "anthropic" | "openai";
  baseUrl?: string | null;
  model?: string | null;
  enabled?: boolean;
  /** undefined = leave unchanged, "" = clear, otherwise = set (encrypted). */
  apiKey?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ResolvedConfig {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
  baseUrl: string;
}

const DEFAULT_MODEL: Record<string, string> = {
  anthropic: "claude-opus-4-8",
  openai: "gpt-4o-mini",
};
const DEFAULT_BASE: Record<string, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
};

@Injectable()
export class AiService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Single-org MVP: resolve the (first) organization id. */
  private async orgId(): Promise<string | null> {
    const [org] = await this.db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .limit(1);
    return org?.id ?? null;
  }

  private defaultModelFor(provider: string): string {
    return DEFAULT_MODEL[provider] ?? DEFAULT_MODEL.anthropic!;
  }

  async getSettings(): Promise<AiSettingsView> {
    const org = await this.orgId();
    const row = org
      ? (
          await this.db
            .select()
            .from(schema.aiSettings)
            .where(eq(schema.aiSettings.organizationId, org))
            .limit(1)
        )[0]
      : undefined;
    const provider = (row?.provider as "anthropic" | "openai") ?? "anthropic";
    return {
      provider,
      baseUrl: row?.baseUrl ?? null,
      model: row?.model ?? null,
      enabled: row?.enabled ?? false,
      hasKey: Boolean(row?.apiKeyEncrypted),
      defaultModel: this.defaultModelFor(provider),
    };
  }

  async saveSettings(input: SaveAiSettingsInput): Promise<AiSettingsView> {
    const org = await this.orgId();
    if (!org) throw new Error("no organization");

    const [existing] = await this.db
      .select()
      .from(schema.aiSettings)
      .where(eq(schema.aiSettings.organizationId, org))
      .limit(1);

    // Resolve the encrypted key: undefined → keep, "" → clear, else → encrypt.
    let apiKeyEncrypted = existing?.apiKeyEncrypted ?? null;
    if (input.apiKey !== undefined) {
      apiKeyEncrypted = input.apiKey ? encryptSecrets({ apiKey: input.apiKey }) : null;
    }

    const values = {
      provider: input.provider ?? existing?.provider ?? "anthropic",
      baseUrl: input.baseUrl !== undefined ? input.baseUrl : (existing?.baseUrl ?? null),
      model: input.model !== undefined ? input.model : (existing?.model ?? null),
      enabled: input.enabled ?? existing?.enabled ?? false,
      apiKeyEncrypted,
    };

    if (existing) {
      await this.db
        .update(schema.aiSettings)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(schema.aiSettings.organizationId, org));
    } else {
      await this.db
        .insert(schema.aiSettings)
        .values({ organizationId: org, ...values });
    }
    return this.getSettings();
  }

  /** Resolve a runnable config (decrypted key); null if not usable. */
  private async resolveConfig(): Promise<ResolvedConfig | null> {
    const org = await this.orgId();
    if (!org) return null;
    const [row] = await this.db
      .select()
      .from(schema.aiSettings)
      .where(eq(schema.aiSettings.organizationId, org))
      .limit(1);
    if (!row || !row.enabled || !row.apiKeyEncrypted) return null;
    let apiKey = "";
    try {
      apiKey = decryptSecrets(row.apiKeyEncrypted).apiKey ?? "";
    } catch {
      return null;
    }
    if (!apiKey) return null;
    const provider = (row.provider as "anthropic" | "openai") ?? "anthropic";
    return {
      provider,
      apiKey,
      model: row.model?.trim() || this.defaultModelFor(provider),
      baseUrl: row.baseUrl?.trim() || DEFAULT_BASE[provider]!,
    };
  }

  /** Build a compact, read-only portfolio snapshot for the assistant. */
  private async buildContext(): Promise<string> {
    const org = await this.orgId();
    if (!org) return "No organization data available.";

    const projects = await this.db
      .select({
        name: schema.projects.name,
        status: schema.projects.status,
        domain: schema.projects.domain,
      })
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, org))
      .limit(100);

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentEvents = await this.db
      .select({
        title: schema.events.title,
        severity: schema.events.severity,
        name: schema.projects.name,
      })
      .from(schema.events)
      .innerJoin(schema.projects, eq(schema.events.projectId, schema.projects.id))
      .where(and(eq(schema.projects.organizationId, org), gte(schema.events.occurredAt, since)))
      .orderBy(desc(schema.events.occurredAt))
      .limit(25);

    const domains = await this.db
      .select({
        fqdn: schema.domains.fqdn,
        expiresAt: schema.domains.expiresAt,
        registrar: schema.domains.registrar,
      })
      .from(schema.domains)
      .where(eq(schema.domains.organizationId, org))
      .orderBy(sql`${schema.domains.expiresAt} asc nulls last`)
      .limit(100);

    const lines: string[] = [];
    lines.push(`Projects (${projects.length}):`);
    for (const p of projects) {
      lines.push(`- ${p.name} [${p.status}]${p.domain ? ` (${p.domain})` : ""}`);
    }
    if (domains.length) {
      lines.push("", "Domains (fqdn — expires — registrar):");
      for (const d of domains) {
        lines.push(`- ${d.fqdn} — ${d.expiresAt ?? "unknown"}${d.registrar ? ` — ${d.registrar}` : ""}`);
      }
    }
    if (recentEvents.length) {
      lines.push("", "Recent events (last 7 days):");
      for (const e of recentEvents) {
        lines.push(`- [${e.severity}] ${e.name}: ${e.title}`);
      }
    }
    return lines.join("\n");
  }

  async chat(messages: ChatMessage[]): Promise<{ reply: string }> {
    const cfg = await this.resolveConfig();
    if (!cfg) {
      return {
        reply:
          "The AI assistant isn't configured yet. An admin can connect a provider in Settings → AI.",
      };
    }
    const context = await this.buildContext();
    const system =
      "You are Webmana's portfolio assistant. Answer questions about the user's " +
      "domains, projects, uptime, expiries, and recent events using ONLY the " +
      "context below. Be concise and concrete; if the answer isn't in the context, " +
      "say so.\n\n--- PORTFOLIO CONTEXT ---\n" +
      context;

    const trimmed = messages.slice(-12).filter((m) => m.content.trim());
    const reply = await callProvider(cfg, system, trimmed);
    return { reply };
  }
}

/** Call the configured provider (Anthropic Messages API or OpenAI-compatible). */
async function callProvider(
  cfg: ResolvedConfig,
  system: string,
  messages: ChatMessage[],
  timeoutMs = 40_000,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (cfg.provider === "anthropic") {
      const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 1024,
          system,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Anthropic API error ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
      }
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      return (
        (data.content ?? [])
          .filter((b) => b.type === "text" && typeof b.text === "string")
          .map((b) => b.text)
          .join("")
          .trim() || "(no response)"
      );
    }

    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1024,
        messages: [{ role: "system", content: system }, ...messages],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Provider API error ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() || "(no response)";
  } finally {
    clearTimeout(timer);
  }
}
