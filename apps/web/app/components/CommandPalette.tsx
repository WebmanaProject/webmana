"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { NAV_ITEMS } from "./nav";

/** Custom event other components dispatch to open the palette. */
export const OPEN_EVENT = "webmana:open-command";

interface ProjectLite {
  id: string;
  name: string;
  domain: string | null;
}

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: "Navigate" | "Projects" | "Actions";
  icon?: React.ReactNode;
  run: () => void;
}

export function CommandPalette() {
  const { toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  // Lazy-load projects the first time the palette opens.
  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/projects`, { credentials: "include", cache: "no-store" });
      if (res.ok) {
        const rows = (await res.json()) as ProjectLite[];
        setProjects(rows.map((p) => ({ id: p.id, name: p.name, domain: p.domain })));
      }
    } catch {
      /* palette still works for navigation without projects */
    }
  }, []);

  // Global open: ⌘K / Ctrl-K, or a dispatched OPEN_EVENT (topbar button).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      void loadProjects();
      // Focus the input after the modal paints.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, loadProjects]);

  const go = useCallback(
    (href: string) => {
      close();
      window.location.href = href;
    },
    [close],
  );

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = NAV_ITEMS.map((n) => ({
      id: `nav:${n.href}`,
      label: n.label,
      hint: "Go to",
      group: "Navigate",
      icon: n.icon,
      run: () => go(n.href),
    }));
    const actions: Command[] = [
      { id: "act:new", label: "New project", hint: "Create", group: "Actions", run: () => go("/manage") },
      { id: "act:theme", label: "Toggle theme", hint: "Light / dark", group: "Actions", run: () => { toggle(); close(); } },
    ];
    const projectCmds: Command[] = projects.map((p) => ({
      id: `proj:${p.id}`,
      label: p.name,
      hint: p.domain ?? "project",
      group: "Projects",
      run: () => go(`/projects/${p.id}`),
    }));
    return [...nav, ...actions, ...projectCmds];
  }, [projects, go, toggle, close]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.hint?.toLowerCase().includes(q) ?? false),
    );
  }, [commands, query]);

  // Keep the active index in range as the list filters.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  if (!open) return null;

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[active]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  // Render rows with group headers.
  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm animate-fade-in"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-card-hover animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <span className="text-text-muted">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onListKey}
            placeholder="Search projects, pages, actions…"
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-text-muted/70"
            aria-label="Command palette search"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted sm:inline">
            esc
          </kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-text-muted">No matches.</li>
          ) : (
            filtered.map((c, i) => {
              const showGroup = c.group !== lastGroup;
              lastGroup = c.group;
              return (
                <li key={c.id}>
                  {showGroup && (
                    <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted/70">
                      {c.group}
                    </div>
                  )}
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => c.run()}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition ${
                      i === active ? "bg-accent/10 text-accent-strong" : "hover:bg-bg-subtle"
                    }`}
                  >
                    {c.icon && <span className="shrink-0 text-text-muted">{c.icon}</span>}
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.hint && <span className="shrink-0 text-xs text-text-muted">{c.hint}</span>}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
