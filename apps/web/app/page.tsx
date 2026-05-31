export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-subtle px-4 py-1.5 text-sm text-text-muted">
        <span className="h-2 w-2 rounded-full bg-accent" />
        Self-hosted · Open source · AI-native
      </span>

      <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
        Your domains.{" "}
        <span className="text-accent-strong">One pane of glass.</span>
      </h1>

      <p className="max-w-2xl text-balance text-lg text-text-muted">
        Webmana brings uptime, SSL, performance, security, and cost for all your projects
        into one dashboard — and hands it to your AI through a built-in MCP server.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <a
          href="https://webmana.dev"
          className="rounded-2xl bg-accent px-5 py-3 font-medium text-accent-ink transition hover:brightness-95"
        >
          Get started
        </a>
        <code className="rounded-2xl border border-border bg-bg-subtle px-5 py-3 font-mono text-sm">
          docker compose up
        </code>
      </div>

      <p className="mt-12 text-sm text-text-muted">
        Phase 0 scaffold — dashboard coming next.
      </p>
    </main>
  );
}
