import { Controller, Get, Query } from "@nestjs/common";
import { InsightsService } from "./insights.service.js";

@Controller("insights")
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get()
  latest(@Query("projectId") projectId?: string) {
    return this.insights.latest(projectId);
  }
}
