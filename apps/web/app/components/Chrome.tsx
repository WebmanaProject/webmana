"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "./AppShell";
import { Footer } from "./Footer";

/** Routes that render their own full-screen layout (no app chrome). /status is
 *  public — visitors should see the status page, not the app shell. */
const BARE_ROUTES = ["/login", "/invite", "/status"];

/**
 * Wraps every page with the app shell (left rail + top bar) + footer, except
 * auth screens which are intentionally chrome-free. Rendered once in the layout.
 */
export function Chrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_ROUTES.some((r) => pathname.startsWith(r));

  if (bare) return <>{children}</>;

  return (
    <AppShell>
      <div className="min-h-[calc(100vh-3.5rem)]">{children}</div>
      <Footer />
    </AppShell>
  );
}
