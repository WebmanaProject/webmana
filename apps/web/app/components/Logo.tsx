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

/** Wordmark: logo + "Webmana" with the accent on the second half. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <Logo className="h-7 w-7" />
      <span className="text-[15px] font-semibold tracking-tight">
        Web<span className="text-accent-strong">mana</span>
      </span>
    </span>
  );
}
