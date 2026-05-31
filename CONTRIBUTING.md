# Contributing to Webmana

Thanks for your interest in improving Webmana! This guide covers how to set up
the project, the contribution workflow, and the rules every change must follow.

## Developer Certificate of Origin (DCO)

All commits **must** be signed off under the
[Developer Certificate of Origin](https://developercertificate.org/). This
certifies that you wrote the code or otherwise have the right to submit it under
the project's license.

Add the sign-off automatically with:

```bash
git commit -s -m "feat(connectors): add my connector"
```

This appends a `Signed-off-by: Your Name <you@example.com>` trailer using your
git identity. PRs without sign-off on every commit cannot be merged.

## Licensing

Webmana is dual-licensed; contributions are accepted under the license of the
area you touch:

- **Application** (`apps/*`) — AGPL-3.0-only.
- **Connector SDK packages** (`packages/connectors`, `packages/contracts`) —
  Apache-2.0, so connectors can be built and shared freely.

By contributing you agree your changes are licensed accordingly.

## Development setup

Prerequisites: Node `>=22`, pnpm `11.2.2`, Docker (for the full stack).

```bash
pnpm install
pnpm build        # turbo build across the monorepo
pnpm typecheck
pnpm lint
pnpm test
```

To run the full stack locally, follow the Quickstart in the
[README](README.md).

## Project layout

| Path                   | Description |
|------------------------|-------------|
| `apps/web`             | Next.js dashboard |
| `apps/api`             | NestJS REST API |
| `apps/worker`          | BullMQ poller |
| `apps/mcp`             | MCP server |
| `packages/contracts`   | Shared Zod schemas + types |
| `packages/connectors`  | Connector SDK + built-in connectors |
| `packages/db`          | Drizzle schema, migrations, client |

## Contributing a connector

The connector SDK and a worked example are documented in
[`docs/CONNECTORS.md`](docs/CONNECTORS.md). In short:

1. Add the connector id to `connectorIdSchema` in `packages/contracts/src/index.ts`.
2. Create `packages/connectors/src/builtin/<id>.ts` implementing the
   `Connector<Raw>` interface:
   - `fetch()` does all I/O, never throws for expected failures (return a raw
     object with an `error` field instead), and always uses an
     `AbortController` timeout.
   - `normalize()` is **pure** — it maps the raw payload to metrics + events
     with no side effects.
3. Register it in `packages/connectors/src/registry.ts` and re-export it from
   `packages/connectors/src/index.ts`.
4. Unit-test `normalize()` against mock data (good / partial / error cases).

Secrets must always be stored encrypted at rest — never log or commit them.

## Coding standards

- TypeScript, NodeNext module resolution; import local files with the `.js`
  extension as the rest of the codebase does.
- Keep the MVP **read-only**: no write actions against external services.
- All user-facing text and documentation is in **English**.
- Run `pnpm typecheck && pnpm lint && pnpm build` before opening a PR; CI runs
  the same checks.

## Pull requests

1. Branch off `main`.
2. Make focused commits, each signed off (`-s`).
3. Ensure CI is green (typecheck, lint, build).
4. Describe what changed and how you verified it.

## Reporting security issues

Please do not open public issues for security vulnerabilities. Instead, contact
the maintainers privately so a fix can be prepared before disclosure.
