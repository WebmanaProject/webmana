import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller.js";
import { DbModule } from "./db/db.module.js";
import { ProjectsModule } from "./projects/projects.module.js";
import { TimelineModule } from "./timeline/timeline.module.js";
import { StatusModule } from "./status/status.module.js";

@Module({
  imports: [DbModule, ProjectsModule, TimelineModule, StatusModule],
  controllers: [HealthController],
})
export class AppModule {}
