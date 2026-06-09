"use client";

import { logout } from "../lib/auth";
import { useTheme } from "../lib/theme";

/** Webmana logo mark — a hexagon "globe/grid" in the accent color. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <path
        d="M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25L16 2.5Z"
        fill="rgb(var(--accent) / 0.14)"
        stroke="rgb(var(--accent-strong))"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M16 6.5v19M7.5 11v10M24.5 11v10"
        stroke="rgb(var(--accent-strong))"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="16" cy="16" r="3.1" fill="rgb(var(--accent))" stroke="rgb(var(--accent-ink))" strokeWidth="1" />
    </svg>
  );
}

interface NavLink {
  href: string;
  label: string;
}

/** App header: clickable logo → dashboard, nav links, theme toggle, logout. */
export function Header({
  links = [],
  actions,
}: {
  links?: NavLink[];
  actions?: React.ReactNode;
}) {
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-6">
        <a
          href="/dashboard"
          className="group flex items-center gap-2.5 rounded-lg px-1 py-1 transition hover:opacity-90"
          aria-label="Webmana — go to dashboard"
        >
          <span className="grid h-8 w-8 place-items-center transition-transform group-hover:scale-105">
            <Logo className="h-7 w-7" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            Web<span className="text-accent-strong">mana</span>
          </span>
        </a>

        <nav className="flex items-center gap-1 text-sm">
          {actions}
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-text-muted transition hover:bg-bg-subtle hover:text-text"
            >
              {l.label}
            </a>
          ))}
          <button
            onClick={toggle}
            className="ml-1 grid h-9 w-9 place-items-center rounded-lg border border-border text-text-muted transition hover:border-accent hover:text-text"
            aria-label="Toggle theme"
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <button
            onClick={() => void logout()}
            className="rounded-lg px-3 py-2 text-text-muted transition hover:bg-bg-subtle hover:text-text"
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}
