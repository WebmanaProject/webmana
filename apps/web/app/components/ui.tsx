"use client";

/**
 * Aurora — Webmana's dependency-light component layer.
 *
 * Thin wrappers over the token utilities in globals.css (.card, .btn-accent,
 * .btn-ghost, .input, .badge). Keep these presentational and composable; no
 * data fetching, no business logic.
 */

import { useEffect, type ReactNode } from "react";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ----------------------------------------------------------------- Button -- */

type ButtonVariant = "accent" | "ghost" | "danger";

export function Button({
  variant = "accent",
  className,
  type = "button",
  ...props
}: { variant?: ButtonVariant } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    variant === "accent"
      ? "btn-accent"
      : variant === "ghost"
        ? "btn-ghost"
        : "inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3.5 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";
  return <button type={type} className={cx(base, className)} {...props} />;
}

/* ------------------------------------------------------------------- Card -- */

export function Card({
  interactive = false,
  className,
  children,
  ...props
}: { interactive?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx(interactive ? "card-interactive" : "card", className)} {...props}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ Badge -- */

type BadgeTone = "accent" | "amber" | "red" | "sky" | "neutral";

const BADGE_TONES: Record<BadgeTone, string> = {
  accent: "bg-accent/15 text-accent-strong",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  sky: "bg-sky-100 text-sky-700",
  neutral: "bg-bg-subtle text-text-muted",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cx("badge", BADGE_TONES[tone], className)}>{children}</span>;
}

/* ------------------------------------------------------------------ Field -- */

/** Labelled input. Spreads native input props. */
export function Field({
  label,
  hint,
  className,
  ...props
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-xs font-medium text-text-muted">
      <span className="flex items-baseline justify-between gap-2">
        {label}
        {hint && <span className="font-normal text-text-muted/60">{hint}</span>}
      </span>
      <input className={cx("input mt-1 w-full", className)} {...props} />
    </label>
  );
}

/* -------------------------------------------------------------- EmptyState -- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-bg-subtle/40 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-text-muted/60">{icon}</div>}
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- StatTile -- */

type Trend = "up" | "down" | "flat";

export function StatTile({
  label,
  value,
  unit,
  hint,
  trend,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  trend?: Trend;
}) {
  const trendCls = trend === "up" ? "text-accent-strong" : trend === "down" ? "text-red-600" : "text-text-muted";
  const trendGlyph = trend === "up" ? "▲" : trend === "down" ? "▼" : trend === "flat" ? "—" : null;
  return (
    <Card className="p-5">
      <div className="eyebrow">{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {unit && <span className="text-sm font-normal text-text-muted">{unit}</span>}
        {trendGlyph && <span className={cx("ml-1 text-xs", trendCls)}>{trendGlyph}</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </Card>
  );
}

/* ------------------------------------------------------------------ Modal -- */

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // Close on Escape for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-card-hover animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md px-2 text-text-muted hover:bg-bg-subtle" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Spinner -- */

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-text-muted">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {label}
    </div>
  );
}
