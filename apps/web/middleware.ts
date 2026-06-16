import { NextResponse, type NextRequest } from "next/server";

/** Session cookie name (mirrors SESSION_COOKIE in the API). */
const SESSION_COOKIE = "webmana_session";

/** Routes that render without a session (auth + the public status page). */
const PUBLIC_PREFIXES = ["/login", "/invite", "/status"];

/**
 * Server-side route guard. Redirects unauthenticated requests for app pages to
 * /login *before* any protected content is sent, and marks protected responses
 * no-store so the browser's back/forward cache can't restore them after logout.
 * The API still enforces real auth on every data request; this stops the
 * page-shell "peek" via the back button.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (!isPublic && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  if (!isPublic) {
    // Defeat bfcache for authenticated pages.
    res.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  }
  return res;
}

export const config = {
  // Run on app routes only; skip Next internals, static assets, and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
