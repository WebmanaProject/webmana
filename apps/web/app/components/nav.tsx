import type { ReactNode } from "react";

/** A primary navigation destination. `icon` is a 20px stroke glyph. */
export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Single source of truth for the app's primary navigation. */
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Portfolio",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...s}>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/finance",
    label: "Finance",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...s}>
        <path d="M3 17l5-5 4 3 8-8" />
        <path d="M16 4h5v5" />
      </svg>
    ),
  },
  {
    href: "/incidents",
    label: "Incidents",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...s}>
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    href: "/manage",
    label: "Manage",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...s}>
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="14" y2="18" />
      </svg>
    ),
  },
  {
    href: "/sla",
    label: "SLA",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...s}>
        <path d="M12 3a9 9 0 1 0 9 9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...s}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 7.5 19.4l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 13.8H4.5a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 6.2 8.16l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 12 4.6V4.5a2 2 0 1 1 4 0v.09c.6.25 1.18.66 1.51 1.51" />
      </svg>
    ),
  },
];

/** Whether a nav item is the active route. `/dashboard` matches exactly only. */
export function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}
