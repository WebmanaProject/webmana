import { Controller, Get, Header, UseGuards } from "@nestjs/common";
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

  /** iCalendar feed of domain renewals — import or subscribe in a calendar app. */
  @Get("calendar.ics")
  @Header("content-type", "text/calendar; charset=utf-8")
  @Header("content-disposition", 'attachment; filename="webmana-renewals.ics"')
  calendar() {
    return this.finance.calendar();
  }
}
