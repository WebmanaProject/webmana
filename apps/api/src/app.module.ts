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
  ],
  controllers: [HealthController],
})
export class AppModule {}
