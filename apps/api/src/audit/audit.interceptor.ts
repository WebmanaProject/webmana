import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { type Observable, tap } from "rxjs";
import type { JwtPayload } from "../auth/crypto.js";
import { AuditService } from "./audit.service.js";

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

interface ReqLike {
  method?: string;
  originalUrl?: string;
  url?: string;
  params?: Record<string, string>;
  user?: JwtPayload;
}
interface ResLike {
  statusCode?: number;
}

/**
 * Records every successful mutating request (POST/PATCH/PUT/DELETE) to the audit
 * log. Read requests are ignored. Failures are captured with their status code.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<ReqLike>();
    const method = (req.method ?? "GET").toUpperCase();
    if (!MUTATING.has(method)) return next.handle();

    const path = (req.originalUrl ?? req.url ?? "").split("?")[0] ?? "";
    const targetId = req.params?.id ?? req.params?.domainId ?? req.params?.noteId ?? null;
    const actorEmail = req.user?.email ?? null;
    const actorRole = req.user?.role ?? null;

    const write = (statusCode: number) =>
      void this.audit.record({
        actorEmail,
        actorRole,
        action: `${method} ${path}`,
        method,
        path,
        targetId,
        statusCode,
      });

    return next.handle().pipe(
      tap({
        next: () => write(http.getResponse<ResLike>().statusCode ?? 200),
        error: (err: { status?: number }) => write(typeof err?.status === "number" ? err.status : 500),
      }),
    );
  }
}
