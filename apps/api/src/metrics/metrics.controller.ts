import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { MetricsService } from "./metrics.service.js";
import { AuthGuard } from "../auth/auth.guard.js";

@Controller("metrics")
@UseGuards(AuthGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** Time-series history for a project, optionally filtered to `name`(s). */
  @Get("history")
  history(
    @Query("projectId") projectId: string,
    @Query("windowDays") windowDays?: string,
    @Query("name") name?: string,
  ) {
    const names = name ? name.split(",").map((n) => n.trim()).filter(Boolean) : undefined;
    return this.metrics.history(projectId, windowDays ? Number(windowDays) : undefined, names);
  }
}
