import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ManageService,
  type CreateProjectInput,
  type UpdateProjectInput,
  type UpsertConnectorInput,
} from "./manage.service.js";

@Controller("manage")
export class ManageController {
  constructor(private readonly manage: ManageService) {}

  /** Projects with tags + connector instances (with ids) for the admin UI. */
  @Get("projects")
  listProjects() {
    return this.manage.listProjectsForManagement();
  }

  /** Catalog of connectors that can be added to a project. */
  @Get("connectors")
  catalog() {
    return this.manage.listConnectorCatalog();
  }

  @Post("projects")
  createProject(@Body() body: CreateProjectInput) {
    return this.manage.createProject(body);
  }

  @Patch("projects/:id")
  updateProject(@Param("id") id: string, @Body() body: UpdateProjectInput) {
    return this.manage.updateProject(id, body).then(() => ({ ok: true }));
  }

  @Delete("projects/:id")
  @HttpCode(200)
  deleteProject(@Param("id") id: string) {
    return this.manage.deleteProject(id).then(() => ({ ok: true }));
  }

  @Post("projects/:id/connectors")
  upsertConnector(@Param("id") id: string, @Body() body: UpsertConnectorInput) {
    return this.manage.upsertConnector(id, body);
  }

  @Patch("projects/:id/connectors/:instanceId")
  setEnabled(
    @Param("id") id: string,
    @Param("instanceId") instanceId: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.manage
      .setConnectorEnabled(id, instanceId, body.enabled)
      .then(() => ({ ok: true }));
  }

  @Delete("projects/:id/connectors/:instanceId")
  @HttpCode(200)
  deleteConnector(@Param("id") id: string, @Param("instanceId") instanceId: string) {
    return this.manage.deleteConnector(id, instanceId).then(() => ({ ok: true }));
  }
}
