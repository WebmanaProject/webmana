import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

/* --------------------------------------------------------------- passwords -- */

const SCRYPT_KEYLEN = 64;

/** Hash a password with scrypt. Format: "scrypt$<saltHex>$<hashHex>". */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Verify a password against a stored "scrypt$salt$hash" string. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "hex");
  const expected = Buffer.from(parts[2]!, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/* -------------------------------------------------------------------- JWT --- */

const b64url = (buf: Buffer): string =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const b64urlJson = (obj: unknown): string =>
  b64url(Buffer.from(JSON.stringify(obj), "utf8"));

function jwtSecret(): string {
  return process.env.JWT_SECRET ?? "dev-insecure-jwt-secret-change-me";
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  exp: number; // unix seconds
}

/** Sign an HS256 JWT. Default TTL 7 days. */
export function signJwt(
  payload: Omit<JwtPayload, "exp">,
  ttlSeconds = 7 * 24 * 60 * 60,
): string {
  const header = b64urlJson({ alg: "HS256", typ: "JWT" });
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = b64urlJson({ ...payload, exp });
  const data = `${header}.${body}`;
  const sig = b64url(createHmac("sha256", jwtSecret()).update(data).digest());
  return `${data}.${sig}`;
}

/** Verify an HS256 JWT and return its payload, or null if invalid/expired. */
export function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];
  const expected = b64url(
    createHmac("sha256", jwtSecret()).update(`${header}.${body}`).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as JwtPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Extract a named cookie value from a raw Cookie header. */
export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export const SESSION_COOKIE = "webmana_session";
