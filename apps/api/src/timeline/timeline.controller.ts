import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { TimelineService } from "./timeline.service.js";
import { AuthGuard } from "../auth/auth.guard.js";

@Controller("timeline")
@UseGuards(AuthGuard)
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Get()
  list(
    @Query("projectId") projectId?: string,
    @Query("severity") severity?: "info" | "warning" | "critical",
    @Query("limit") limit?: string,
  ) {
    return this.timeline.list({
      projectId,
      severity,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
