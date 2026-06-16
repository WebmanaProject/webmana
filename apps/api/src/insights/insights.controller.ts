import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { InsightsService } from "./insights.service.js";
import { AuthGuard } from "../auth/auth.guard.js";

@Controller("insights")
@UseGuards(AuthGuard)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get()
  latest(@Query("projectId") projectId?: string) {
    return this.insights.latest(projectId);
  }
}
