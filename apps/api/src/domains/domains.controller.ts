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
import { DomainsService, type DomainInput } from "./domains.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { RolesGuard, Roles } from "../auth/roles.guard.js";

@Controller("domains")
@UseGuards(AuthGuard, RolesGuard)
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  list() {
    return this.domains.list();
  }

  @Post()
  @Roles("editor")
  create(@Body() body: DomainInput) {
    return this.domains.create(body);
  }

  @Patch(":id")
  @Roles("editor")
  update(@Param("id") id: string, @Body() body: DomainInput) {
    return this.domains.update(id, body).then(() => ({ ok: true }));
  }

  @Delete(":id")
  @Roles("editor")
  @HttpCode(200)
  remove(@Param("id") id: string) {
    return this.domains.remove(id).then(() => ({ ok: true }));
  }

  @Post(":id/projects/:projectId")
  @Roles("editor")
  link(
    @Param("id") id: string,
    @Param("projectId") projectId: string,
    @Body() body: { primary?: boolean },
  ) {
    return this.domains.linkProject(id, projectId, body?.primary ?? false).then(() => ({ ok: true }));
  }

  @Delete(":id/projects/:projectId")
  @Roles("editor")
  @HttpCode(200)
  unlink(@Param("id") id: string, @Param("projectId") projectId: string) {
    return this.domains.unlinkProject(id, projectId).then(() => ({ ok: true }));
  }
}
