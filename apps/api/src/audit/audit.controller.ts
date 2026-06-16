import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuditService } from "./audit.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { RolesGuard, Roles } from "../auth/roles.guard.js";

@Controller("audit")
@UseGuards(AuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Recent audit entries — admin only. Supports limit + offset paging. */
  @Get()
  @Roles("admin")
  list(@Query("limit") limit?: string, @Query("offset") offset?: string) {
    return this.audit.list(
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : undefined,
    );
  }
}
