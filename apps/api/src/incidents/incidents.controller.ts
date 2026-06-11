import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IncidentsService,
  type CreateIncidentInput,
  type UpdateIncidentInput,
} from "./incidents.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { RolesGuard, Roles } from "../auth/roles.guard.js";

@Controller("incidents")
@UseGuards(AuthGuard, RolesGuard)
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  list(@Query("status") status?: string) {
    return this.incidents.list(status);
  }

  @Post()
  @Roles("editor")
  create(@Body() body: CreateIncidentInput) {
    return this.incidents.create(body);
  }

  @Patch(":id")
  @Roles("editor")
  update(@Param("id") id: string, @Body() body: UpdateIncidentInput) {
    return this.incidents.update(id, body).then(() => ({ ok: true }));
  }

  @Delete(":id")
  @Roles("editor")
  @HttpCode(200)
  remove(@Param("id") id: string) {
    return this.incidents.remove(id).then(() => ({ ok: true }));
  }
}
