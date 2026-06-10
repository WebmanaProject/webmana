/**
 * Global footer. The Source link satisfies AGPL-3.0 §13: network users must be
 * able to obtain the running app's source. Point NEXT_PUBLIC_SOURCE_URL at your
 * fork if you modify Webmana.
 */
const SOURCE_URL =
  process.env.NEXT_PUBLIC_SOURCE_URL ?? "https://github.com/WebmanaProject/webmana";

export function Footer() {
  return (
    <footer className="mx-auto max-w-[1600px] px-6 py-6 text-xs text-text-muted">
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
        <span>
          Webmana · self-hosted · AGPL-3.0
        </span>
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-accent-strong hover:underline"
        >
          Source code ↗
        </a>
      </div>
    </footer>
  );
}
