import { Controller, Get, Query } from "@nestjs/common";
import { SlaService } from "./sla.service.js";

@Controller("sla")
export class SlaController {
  constructor(private readonly sla: SlaService) {}

  @Get()
  report(
    @Query("windowDays") windowDays?: string,
    @Query("projectId") projectId?: string,
  ) {
    return this.sla.report(windowDays ? Number(windowDays) : undefined, projectId);
  }
}
