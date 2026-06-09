import { Controller, Get, UseGuards } from "@nestjs/common";
import { FinanceService } from "./finance.service.js";
import { AuthGuard } from "../auth/auth.guard.js";

@Controller("finance")
@UseGuards(AuthGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  report() {
    return this.finance.report();
  }
}
