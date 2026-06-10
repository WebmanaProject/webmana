"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { Footer } from "./Footer";

/** Routes that render their own full-screen layout (no app chrome). */
const BARE_ROUTES = ["/login", "/invite"];

/**
 * Wraps every page with the shared header + footer, except auth screens which
 * are intentionally chrome-free. Rendered once in the root layout.
 */
export function Chrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_ROUTES.some((r) => pathname.startsWith(r));

  if (bare) return <>{children}</>;

  return (
    <>
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </>
  );
}
