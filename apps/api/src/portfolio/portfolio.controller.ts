import { Body, Controller, Get, Header, Post, UseGuards } from "@nestjs/common";
import { PortfolioService } from "./portfolio.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { RolesGuard, Roles } from "../auth/roles.guard.js";

@Controller("portfolio")
@UseGuards(AuthGuard, RolesGuard)
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  /** Download the org's portfolio as JSON (admin). */
  @Get("export")
  @Roles("admin")
  @Header("content-disposition", 'attachment; filename="webmana-portfolio.json"')
  exportPortfolio() {
    return this.portfolio.exportPortfolio();
  }

  /** Import a portfolio export (additive; admin). */
  @Post("import")
  @Roles("admin")
  importPortfolio(@Body() body: unknown) {
    return this.portfolio.importPortfolio(body);
  }
}
