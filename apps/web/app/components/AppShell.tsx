"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { logout } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { Logo, Wordmark } from "./Logo";
import { NAV_ITEMS, isActiveRoute } from "./nav";

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="grid h-9 w-9 place-items-center rounded-lg border border-border text-text-muted transition hover:border-accent hover:text-text"
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
  );
}

/** Vertical nav list, shared by the desktop rail and the mobile drawer. */
function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = isActiveRoute(pathname, item.href);
        return (
          <a
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-accent/10 text-accent-strong"
                : "text-text-muted hover:bg-bg-subtle hover:text-text"
            }`}
          >
            <span className={active ? "text-accent-strong" : "text-text-muted"}>{item.icon}</span>
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

/**
 * Application shell: a persistent left rail on `lg+`, a sticky top bar, and a
 * slide-in drawer below `lg`. Rendered once by Chrome on non-bare routes.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop left rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border/70 bg-bg/60 px-3 py-4 backdrop-blur-xl lg:flex">
        <a href="/dashboard" className="mb-6 flex items-center px-2 py-1 transition hover:opacity-90" aria-label="Webmana — go to dashboard">
          <Wordmark />
        </a>
        <NavList pathname={pathname} />
        <div className="mt-auto px-1 pt-4">
          <button
            onClick={() => void logout()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-muted transition hover:bg-bg-subtle hover:text-text"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/70 bg-bg/70 px-4 backdrop-blur-xl sm:px-6">
        {/* Mobile: menu + wordmark */}
        <button
          onClick={() => setOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-border text-text-muted transition hover:border-accent hover:text-text lg:hidden"
          aria-label="Open menu"
          aria-expanded={open}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        </button>
        <a href="/dashboard" className="lg:hidden" aria-label="Webmana — go to dashboard">
          <Logo className="h-7 w-7" />
        </a>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
        </div>
      </header>

      <div>{children}</div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col border-r border-border bg-bg px-3 py-4 shadow-card-hover">
            <div className="mb-6 flex items-center justify-between px-2 py-1">
              <Wordmark />
              <button
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-border text-text-muted transition hover:border-accent hover:text-text"
                aria-label="Close menu"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <NavList pathname={pathname} onNavigate={() => setOpen(false)} />
            <div className="mt-auto px-1 pt-4">
              <button
                onClick={() => void logout()}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-muted transition hover:bg-bg-subtle hover:text-text"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5M21 12H9" />
                </svg>
                Logout
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
