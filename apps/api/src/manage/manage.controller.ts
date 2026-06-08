import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ManageService,
  type CreateProjectInput,
  type UpdateProjectInput,
  type UpsertConnectorInput,
  type CreateAlertRuleInput,
  type CreateAlertChannelInput,
} from "./manage.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { RolesGuard, Roles } from "../auth/roles.guard.js";

@Controller("manage")
@UseGuards(AuthGuard, RolesGuard)
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
  @Roles("editor")
  createProject(@Body() body: CreateProjectInput) {
    return this.manage.createProject(body);
  }

  @Patch("projects/:id")
  @Roles("editor")
  updateProject(@Param("id") id: string, @Body() body: UpdateProjectInput) {
    return this.manage.updateProject(id, body).then(() => ({ ok: true }));
  }

  @Delete("projects/:id")
  @Roles("editor")
  @HttpCode(200)
  deleteProject(@Param("id") id: string) {
    return this.manage.deleteProject(id).then(() => ({ ok: true }));
  }

  @Post("projects/:id/connectors")
  @Roles("editor")
  upsertConnector(@Param("id") id: string, @Body() body: UpsertConnectorInput) {
    return this.manage.upsertConnector(id, body);
  }

  @Patch("projects/:id/connectors/:instanceId")
  @Roles("editor")
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
  @Roles("editor")
  @HttpCode(200)
  deleteConnector(@Param("id") id: string, @Param("instanceId") instanceId: string) {
    return this.manage.deleteConnector(id, instanceId).then(() => ({ ok: true }));
  }

  /* --------------------------------------------------------- Alert rules ---- */

  @Get("projects/:id/alert-rules")
  listAlertRules(@Param("id") id: string) {
    return this.manage.listAlertRules(id);
  }

  @Post("projects/:id/alert-rules")
  @Roles("editor")
  createAlertRule(@Param("id") id: string, @Body() body: CreateAlertRuleInput) {
    return this.manage.createAlertRule(id, body);
  }

  @Delete("projects/:id/alert-rules/:ruleId")
  @Roles("editor")
  @HttpCode(200)
  deleteAlertRule(@Param("id") id: string, @Param("ruleId") ruleId: string) {
    return this.manage.deleteAlertRule(id, ruleId).then(() => ({ ok: true }));
  }

  /* ------------------------------------------------------- Alert channels --- */

  @Get("alert-channels")
  listAlertChannels() {
    return this.manage.listAlertChannels();
  }

  @Post("alert-channels")
  @Roles("editor")
  createAlertChannel(@Body() body: CreateAlertChannelInput) {
    return this.manage.createAlertChannel(body);
  }

  @Delete("alert-channels/:channelId")
  @Roles("editor")
  @HttpCode(200)
  deleteAlertChannel(@Param("channelId") channelId: string) {
    return this.manage.deleteAlertChannel(channelId).then(() => ({ ok: true }));
  }
}
