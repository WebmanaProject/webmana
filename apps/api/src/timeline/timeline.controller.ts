import { Controller, Get, Query } from "@nestjs/common";
import { TimelineService } from "./timeline.service.js";

@Controller("timeline")
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
