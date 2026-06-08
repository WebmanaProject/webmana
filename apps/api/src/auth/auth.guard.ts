import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { readCookie, SESSION_COOKIE, verifyJwt, type JwtPayload } from "./crypto.js";

/** Minimal shape we read from the incoming HTTP request (Express-compatible). */
export interface AuthedRequest {
  headers: { authorization?: string; cookie?: string };
  user?: JwtPayload;
}

/**
 * Requires a valid session JWT (cookie or Bearer header). Attaches the decoded
 * payload to req.user. Protects all write/admin endpoints.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null;
    const token = bearer ?? readCookie(req.headers.cookie, SESSION_COOKIE);

    const payload = token ? verifyJwt(token) : null;
    if (!payload) throw new UnauthorizedException("authentication required");

    req.user = payload;
    return true;
  }
}
