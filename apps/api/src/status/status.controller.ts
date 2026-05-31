import { Controller, Get } from "@nestjs/common";
import { StatusService } from "./status.service.js";

@Controller("status")
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Get()
  page() {
    return this.status.getStatusPage();
  }
}
