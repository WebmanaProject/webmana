# Writing a Webmana Connector

A **connector** pulls data from one source (an API, a protocol probe, a file)
and turns it into Webmana's shared metric/event shape. The worker handles
everything around it — scheduling, retries, error isolation, secret decryption,
and persistence. A connector only implements two methods: `fetch` and
`normalize`.

This separation is the core of Webmana's architecture: **the UI and the MCP
server never call external APIs at request time.** Connectors poll on a
schedule, normalize once, and store the result. Everything downstream reads from
the database.

## The contract

A connector implements the `Connector<Raw>` interface
(`packages/connectors/src/types.ts`):

```ts
export interface Connector<Raw = unknown> {
  id: ConnectorId;
  /** Human-readable name shown in the UI. */
  title: string;
  /** True if the connector needs API credentials (secrets) to run. */
  requiresSecrets: boolean;
  /** Validates ConnectorRunContext.config. */
  configSchema: ZodTypeAny;
  /** Default polling cadence in seconds; the worker enqueues when due. */
  defaultIntervalSeconds: number;
  fetch(ctx: ConnectorRunContext): Promise<Raw>;
  normalize(raw: Raw, ctx: ConnectorRunContext): ConnectorResult;
}
```

`Raw` is your connector's private shape — whatever `fetch` returns and
`normalize` consumes. It never leaves the connector.

### `id`

A value from `ConnectorId` in `@webmana/contracts`. To add a new connector you
must first extend the `connectorIdSchema` enum there, then register it (see
[Registering](#registering)).

### `requiresSecrets`

Set `true` if the connector needs credentials. When `true`, the worker decrypts
the connector instance's stored secrets and passes them as `ctx.secrets`. When
`false`, `ctx.secrets` is `undefined`. Secrets are always stored encrypted at
rest (AES-256-GCM via `@webmana/crypto`); a connector only ever sees the
decrypted values at run time.

### `configSchema`

A Zod schema validating the non-secret, per-instance settings. Parse it at the
top of `fetch` so every run starts from validated, defaulted config:

```ts
const configSchema = z.object({
  path: z.string().default("/"),
  timeoutMs: z.number().int().positive().default(15_000),
});
```

### `defaultIntervalSeconds`

How often the connector should run by default. Cheap probes (uptime) poll
frequently (minutes); expensive or rate-limited APIs (analytics) poll every few
hours.

## The run context

Both methods receive a `ConnectorRunContext`:

```ts
export interface ConnectorRunContext {
  projectId: string;
  /** Primary domain of the project, e.g. "example.com". */
  domain: string;
  /** Non-secret connector settings (validated against the connector's schema). */
  config: Record<string, unknown>;
  /** Decrypted secrets, if the connector requires credentials. */
  secrets?: Record<string, string>;
  /** Wall-clock time for this run; connectors should use it for observedAt. */
  now: Date;
}
```

Use `ctx.now` for every `observedAt` / `occurredAt` so all points from one run
share a single timestamp.

## `fetch` — talk to the outside world

`fetch` does the I/O and returns your `Raw` shape. Rules:

- **Never throw for an expected failure.** A missing key, a non-200 response, a
  timeout — return a `Raw` with an `error` field instead. `normalize` turns that
  into a warning event. Throwing is reserved for genuinely unexpected bugs (the
  worker will catch it and mark the sync `error`, but you lose the chance to
  produce a useful event).
- **Always set a timeout.** Use an `AbortController` with `setTimeout`, and clear
  it in `finally`.
- **Keep `fetch` pure of normalization.** It returns raw numbers; mapping to
  metric names belongs in `normalize`.

## `normalize` — produce metrics and events

`normalize` is **pure**: same input, same output, no I/O. It returns a
`ConnectorResult`:

```ts
export interface ConnectorResult {
  metrics: NormalizedMetric[];
  events: ProjectEvent[];
}
```

A **metric** is a time-series point:

```ts
{
  projectId: ctx.projectId,
  connectorId: "ssl",
  kind: "ssl",                       // a MetricKind: uptime|performance|ssl|dns|whois|security|cost|traffic
  name: "ssl.days_until_expiry",     // dotted, prefixed with the connector id
  value: 42,
  unit: "days",                      // optional
  labels: { endpoint: "/" },         // optional, low-cardinality
  observedAt: ctx.now,
}
```

An **event** is a timeline entry / incident:

```ts
{
  projectId: ctx.projectId,
  connectorId: "ssl",
  severity: "warning",               // info | warning | critical
  title: "Certificate expiring soon",
  description: "Expires in 9 days",
  occurredAt: ctx.now,
}
```

Conventions:

- Prefix every metric `name` with the connector id (`ssl.`, `cloudflare.`).
- Skip metrics whose value is unknown rather than emitting `0` or `null`.
- On `raw.error`, emit a single warning event and no metrics.
- Reserve `critical` for "the thing is broken right now" (site down, cert
  expired); use `warning` for "needs attention" (cert expiring, score regressed).

## Worked example

The reference connector is SSL expiry
(`packages/connectors/src/builtin/ssl.ts`). A minimal connector looks like:

```ts
import { z } from "zod";
import type { Connector, ConnectorResult, ConnectorRunContext } from "../types.js";

const configSchema = z.object({
  timeoutMs: z.number().int().positive().default(10_000),
});

interface ExampleRaw {
  value: number | null;
  error?: string;
}

export const exampleConnector: Connector<ExampleRaw> = {
  id: "example",            // must exist in connectorIdSchema
  title: "Example",
  requiresSecrets: false,
  configSchema,
  defaultIntervalSeconds: 60 * 60,

  async fetch(ctx: ConnectorRunContext): Promise<ExampleRaw> {
    const { timeoutMs } = configSchema.parse(ctx.config);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`https://example.com/${ctx.domain}`, {
        signal: controller.signal,
      });
      if (!res.ok) return { value: null, error: `HTTP ${res.status}` };
      const data = (await res.json()) as { value?: number };
      return { value: data.value ?? null };
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? `request timed out after ${timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : String(err);
      return { value: null, error: message };
    } finally {
      clearTimeout(timer);
    }
  },

  normalize(raw: ExampleRaw, ctx: ConnectorRunContext): ConnectorResult {
    const result: ConnectorResult = { metrics: [], events: [] };
    if (raw.error) {
      result.events.push({
        projectId: ctx.projectId,
        connectorId: "example",
        severity: "warning",
        title: "Example check failed",
        description: raw.error,
        occurredAt: ctx.now,
      });
      return result;
    }
    if (raw.value !== null) {
      result.metrics.push({
        projectId: ctx.projectId,
        connectorId: "example",
        kind: "traffic",
        name: "example.value",
        value: raw.value,
        observedAt: ctx.now,
      });
    }
    return result;
  },
};
```

## Registering

Three edits make a connector live:

1. Add its id to `connectorIdSchema` in `packages/contracts/src/index.ts` (and a
   `MetricKind` if you need a new category).
2. Import and add it to the `connectors` map in
   `packages/connectors/src/registry.ts`.
3. Re-export it from `packages/connectors/src/index.ts`.

Then build the package: `pnpm --filter @webmana/connectors build`.

## Testing

`normalize` is pure, so test it directly with mock `Raw` data — no network, no
database. Cover at least three cases: a successful run, partial/missing values,
and the `error` path. Because `fetch` may need credentials you don't have
locally, unit-testing `normalize` is the primary correctness gate; the SSL and
HTTP-uptime connectors are keyless and can be exercised end-to-end.
