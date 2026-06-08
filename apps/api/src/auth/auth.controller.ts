import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { AuthGuard, type AuthedRequest } from "./auth.guard.js";
import { SESSION_COOKIE } from "./crypto.js";

/** Minimal Express response shape for cookie handling (avoids @types/express dep). */
interface CookieResponse {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    const { token, role } = await this.auth.login(body?.email, body?.password);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: SEVEN_DAYS_MS,
      path: "/",
    });
    return { ok: true, role };
  }

  @Post("logout")
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: CookieResponse) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  /** Current session info; 401 when not authenticated. */
  @Get("me")
  @UseGuards(AuthGuard)
  me(@Req() req: AuthedRequest) {
    if (!req.user) throw new UnauthorizedException();
    return { email: req.user.email, role: req.user.role };
  }
}
