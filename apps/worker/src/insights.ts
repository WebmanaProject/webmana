import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { schema, type Database } from "@webmana/db";

/**
 * AI insight generation.
 *
 * Following the poll->store->serve principle, summaries are produced here in
 * the worker on a schedule and stored; the UI/MCP/API only ever read them.
 *
 * Provider is selected via env and is optional — with no key configured the
 * whole feature no-ops cleanly so the rest of the worker is unaffected.
 *
 *   AI_PROVIDER       "anthropic" | "openai" (default: "anthropic")
 *   AI_API_KEY        provider API key (feature disabled when empty)
 *   AI_MODEL          model id (defaults per provider)
 *   AI_BASE_URL       override base URL (for OpenAI-compatible/self-hosted)
 *   AI_INSIGHTS_INTERVAL_MS   generation cadence (default 6h)
 */

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const METRIC_WINDOW_MS = 24 * 60 * 60 * 1000;
const EVENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface AiConfig {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
  baseUrl: string;
}

/** Read AI config from env; returns null when no API key is set (feature off). */
export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig | null {
  const apiKey = env.AI_API_KEY?.trim();
  if (!apiKey) return null;

  const provider = env.AI_PROVIDER === "openai" ? "openai" : "anthropic";
  const model =
    env.AI_MODEL?.trim() ||
    (provider === "openai" ? "gpt-4o-mini" : "claude-3-5-haiku-latest");
  const baseUrl =
    env.AI_BASE_URL?.trim() ||
    (provider === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com");

  return { provider, apiKey, model, baseUrl };
}

export function insightsIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.AI_INSIGHTS_INTERVAL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INTERVAL_MS;
}

interface ProjectFacts {
  name: string;
  domain: string;
  metrics: { name: string; value: number; unit: string | null }[];
  events: { severity: string; title: string }[];
}

/** Build the compact, deterministic prompt sent to the model. Pure + testable. */
export function buildPrompt(facts: ProjectFacts): string {
  const metricLines = facts.metrics.length
    ? facts.metrics
        .map((m) => `- ${m.name}: ${m.value}${m.unit ? ` ${m.unit}` : ""}`)
        .join("\n")
    : "- (no recent metrics)";
  const eventLines = facts.events.length
    ? facts.events.map((e) => `- [${e.severity}] ${e.title}`).join("\n")
    : "- (no recent events)";

  return [
    `Project: ${facts.name} (${facts.domain})`,
    "",
    "Latest metrics (last 24h):",
    metricLines,
    "",
    "Recent events (last 7 days):",
    eventLines,
    "",
    "In 2-3 sentences, summarize this project's current health for an operator.",
    "Call out anything needing attention (expiring SSL/domain, downtime,",
    "security findings, cost spikes). If everything looks fine, say so plainly.",
    "Do not invent data not shown above.",
  ].join("\n");
}

const SYSTEM_PROMPT =
  "You are a concise site-reliability assistant. Summarize infrastructure health " +
  "factually based only on the provided data. No preamble, no markdown headers.";

/** Parse Anthropic Messages API response into plain text. Pure + testable. */
export function parseAnthropic(data: unknown): string {
  const blocks = (data as { content?: { type?: string; text?: string }[] }).content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Parse OpenAI Chat Completions response into plain text. Pure + testable. */
export function parseOpenAi(data: unknown): string {
  const choices = (data as { choices?: { message?: { content?: string } }[] }).choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

/** Call the configured provider. Returns null on any failure (logged by caller). */
async function generateSummary(
  cfg: AiConfig,
  prompt: string,
  timeoutMs = 30_000,
): Promise<string | null> {
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
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      return parseAnthropic(await res.json()) || null;
    }

    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 300,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return parseOpenAi(await res.json()) || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate and store an insight for every project. Safe to call when AI is
 * disabled (no-op). Failures for one project never abort the others.
 */
export async function generateInsights(db: Database, now: Date): Promise<number> {
  const cfg = readAiConfig();
  if (!cfg) return 0;

  const projectRows = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      domain: schema.projects.domain,
    })
    .from(schema.projects);

  const ids = projectRows.map((p) => p.id);
  if (ids.length === 0) return 0;

  const metricCutoff = new Date(now.getTime() - METRIC_WINDOW_MS);
  const eventCutoff = new Date(now.getTime() - EVENT_WINDOW_MS);

  const [metricRows, eventRows] = await Promise.all([
    db
      .select({
        projectId: schema.metrics.projectId,
        name: schema.metrics.name,
        value: schema.metrics.value,
        unit: schema.metrics.unit,
        observedAt: schema.metrics.observedAt,
      })
      .from(schema.metrics)
      .where(
        and(
          inArray(schema.metrics.projectId, ids),
          gte(schema.metrics.observedAt, metricCutoff),
        ),
      )
      .orderBy(desc(schema.metrics.observedAt)),
    db
      .select({
        projectId: schema.events.projectId,
        severity: schema.events.severity,
        title: schema.events.title,
        occurredAt: schema.events.occurredAt,
      })
      .from(schema.events)
      .where(
        and(
          inArray(schema.events.projectId, ids),
          gte(schema.events.occurredAt, eventCutoff),
        ),
      )
      .orderBy(desc(schema.events.occurredAt)),
  ]);

  let stored = 0;
  for (const project of projectRows) {
    // Latest value per metric name.
    const seen = new Set<string>();
    const metrics: ProjectFacts["metrics"] = [];
    for (const m of metricRows) {
      if (m.projectId !== project.id || seen.has(m.name)) continue;
      seen.add(m.name);
      metrics.push({ name: m.name, value: m.value, unit: m.unit });
    }
    const events = eventRows
      .filter((e) => e.projectId === project.id)
      .slice(0, 10)
      .map((e) => ({ severity: e.severity, title: e.title }));

    const prompt = buildPrompt({
      name: project.name,
      domain: project.domain ?? "(no domain)",
      metrics,
      events,
    });

    const summary = await generateSummary(cfg, prompt);
    if (!summary) continue;

    await db.insert(schema.projectInsights).values({
      projectId: project.id,
      summary,
      model: cfg.model,
      generatedAt: now,
    });
    stored += 1;
  }
  return stored;
}
