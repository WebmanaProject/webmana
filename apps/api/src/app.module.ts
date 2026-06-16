import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller.js";
import { DbModule } from "./db/db.module.js";
import { ProjectsModule } from "./projects/projects.module.js";
import { TimelineModule } from "./timeline/timeline.module.js";
import { StatusModule } from "./status/status.module.js";
import { SlaModule } from "./sla/sla.module.js";
import { InsightsModule } from "./insights/insights.module.js";
import { ManageModule } from "./manage/manage.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { OrgModule } from "./org/org.module.js";
import { DomainsModule } from "./domains/domains.module.js";
import { FinanceModule } from "./finance/finance.module.js";
import { MetricsModule } from "./metrics/metrics.module.js";
import { IncidentsModule } from "./incidents/incidents.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { PortfolioModule } from "./portfolio/portfolio.module.js";

@Module({
  imports: [
    DbModule,
    AuthModule,
    ProjectsModule,
    TimelineModule,
    StatusModule,
    SlaModule,
    InsightsModule,
    ManageModule,
    OrgModule,
    DomainsModule,
    FinanceModule,
    MetricsModule,
    IncidentsModule,
    AuditModule,
    PortfolioModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
