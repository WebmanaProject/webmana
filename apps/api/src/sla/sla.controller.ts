import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { SlaService } from "./sla.service.js";
import { AuthGuard } from "../auth/auth.guard.js";

@Controller("sla")
@UseGuards(AuthGuard)
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
