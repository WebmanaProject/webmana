import { Controller, Get, Query } from "@nestjs/common";
import { ProjectsService } from "./projects.service.js";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Query("tag") tag?: string) {
    return this.projects.listProjects(tag);
  }
}
