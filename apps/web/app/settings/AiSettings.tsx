"use client";

import { useEffect, useState } from "react";
import { authFetch } from "../lib/auth";

interface AiSettingsView {
  provider: "anthropic" | "openai";
  baseUrl: string | null;
  model: string | null;
  enabled: boolean;
  hasKey: boolean;
  defaultModel: string;
}

/** Settings → AI: connect a provider (Anthropic / OpenAI-compatible / self-hosted). */
export function AiSettings() {
  const [s, setS] = useState<AiSettingsView | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    authFetch("/api/ai/settings")
      .then(async (r) => {
        if (r.ok) setS((await r.json()) as AiSettingsView);
      })
      .catch(() => {});
  }, []);

  async function save() {
    if (!s) return;
    setBusy(true);
    setMsg(null);
    const body: Record<string, unknown> = {
      provider: s.provider,
      baseUrl: s.baseUrl?.trim() || null,
      model: s.model?.trim() || null,
      enabled: s.enabled,
    };
    if (apiKey) body.apiKey = apiKey;
    try {
      const r = await authFetch("/api/ai/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setS((await r.json()) as AiSettingsView);
        setApiKey("");
        setMsg("Saved.");
      } else {
        setMsg(r.status === 403 ? "Admin access required." : `Save failed (${r.status}).`);
      }
    } catch {
      setMsg("Could not reach the API.");
    } finally {
      setBusy(false);
    }
  }

  if (!s) return null;

  return (
    <section id="ai" className="card mb-8 scroll-mt-20 p-6">
      <h2 className="mb-1 text-lg font-semibold">AI assistant</h2>
      <p className="mb-4 text-sm text-text-muted">
        Connect a provider to power the <code>/assistant</code> chat and scheduled
        project summaries. Use Anthropic, OpenAI, or any OpenAI-compatible /
        self-hosted endpoint. The key is encrypted at rest and never shown again.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-text-muted">Provider</span>
          <select
            className="input w-full"
            value={s.provider}
            onChange={(e) =>
              setS({ ...s, provider: e.target.value as AiSettingsView["provider"] })
            }
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI-compatible</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-text-muted">Model</span>
          <input
            className="input w-full"
            value={s.model ?? ""}
            onChange={(e) => setS({ ...s, model: e.target.value })}
            placeholder={s.defaultModel}
          />
        </label>

        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-text-muted">
            Base URL <span className="text-text-muted/70">(optional — for self-hosted)</span>
          </span>
          <input
            className="input w-full"
            value={s.baseUrl ?? ""}
            onChange={(e) => setS({ ...s, baseUrl: e.target.value })}
            placeholder={
              s.provider === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com"
            }
          />
        </label>

        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-text-muted">API key</span>
          <input
            className="input w-full"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={s.hasKey ? "•••••••• (key set — leave blank to keep)" : "Paste your API key"}
          />
        </label>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={s.enabled}
          onChange={(e) => setS({ ...s, enabled: e.target.checked })}
        />
        Enable AI features (assistant + summaries)
      </label>

      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="btn-accent disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-sm text-text-muted">{msg}</span>}
      </div>
    </section>
  );
}
