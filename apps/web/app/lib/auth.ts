"use client";

import { useEffect, useState } from "react";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") ?? "http://localhost:4000";

export interface SessionUser {
  email: string;
  role: string;
}

/**
 * Client-side route guard. Checks /api/auth/me; on 401 redirects to /login with
 * a `next` param. Returns the session (or null while loading).
 */
export function useRequireAuth(): { user: SessionUser | null; loading: boolean } {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/api/auth/me`, { credentials: "include" })
      .then(async (res) => {
        if (!active) return;
        if (res.ok) {
          setUser((await res.json()) as SessionUser);
        } else {
          const next = encodeURIComponent(window.location.pathname);
          window.location.href = `/login?next=${next}`;
        }
      })
      .catch(() => {
        if (active) window.location.href = "/login";
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return { user, loading };
}

/** All authenticated fetches must send the session cookie. */
export function authFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, { ...init, credentials: "include" });
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  window.location.href = "/login";
}
