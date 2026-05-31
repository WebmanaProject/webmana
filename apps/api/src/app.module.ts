import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller.js";
import { DbModule } from "./db/db.module.js";
import { ProjectsModule } from "./projects/projects.module.js";

@Module({
  imports: [DbModule, ProjectsModule],
  controllers: [HealthController],
})
export class AppModule {}
