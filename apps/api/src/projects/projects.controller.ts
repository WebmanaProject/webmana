import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ProjectsService } from "./projects.service.js";
import { AuthGuard } from "../auth/auth.guard.js";

@Controller("projects")
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Query("tag") tag?: string) {
    return this.projects.listProjects(tag);
  }
}
