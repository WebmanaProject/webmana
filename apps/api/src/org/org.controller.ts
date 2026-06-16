import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { OrgService } from "./org.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { RolesGuard, Roles } from "../auth/roles.guard.js";

/** Org administration: members, invitations, MCP tokens. Admin-only. */
@Controller("org")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get("members")
  members() {
    return this.org.listMembers();
  }

  @Patch("members/:userId/role")
  changeRole(@Param("userId") userId: string, @Body() body: { role: string }) {
    return this.org.changeRole(userId, body.role).then(() => ({ ok: true }));
  }

  @Delete("members/:userId")
  @HttpCode(200)
  removeMember(
    @Param("userId") userId: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    if (req.user?.sub === userId) {
      throw new BadRequestException("you cannot remove your own account");
    }
    return this.org.removeMember(userId).then(() => ({ ok: true }));
  }

  @Get("invitations")
  invitations() {
    return this.org.listInvitations();
  }

  @Post("invitations")
  invite(@Body() body: { email: string; role: string }) {
    return this.org.invite(body.email, body.role);
  }

  @Get("mcp-tokens")
  mcpTokens() {
    return this.org.listMcpTokens();
  }

  @Post("mcp-tokens")
  createMcpToken(@Body() body: { name: string; role: string }) {
    return this.org.createMcpToken(body.name, body.role);
  }

  @Delete("mcp-tokens/:id")
  @HttpCode(200)
  revokeMcpToken(@Param("id") id: string) {
    return this.org.revokeMcpToken(id).then(() => ({ ok: true }));
  }

  @Get("api-keys")
  apiKeys() {
    return this.org.listApiKeys();
  }

  @Post("api-keys")
  createApiKey(@Body() body: { name: string; role: string }) {
    return this.org.createApiKey(body.name, body.role);
  }

  @Delete("api-keys/:id")
  @HttpCode(200)
  revokeApiKey(@Param("id") id: string) {
    return this.org.revokeApiKey(id).then(() => ({ ok: true }));
  }
}

/** Public endpoint to accept an invitation (token-gated, no session required). */
@Controller("invite")
export class InviteController {
  constructor(private readonly org: OrgService) {}

  @Post("accept")
  @HttpCode(200)
  accept(@Body() body: { token: string; name: string; password: string }) {
    return this.org.accept(body.token, body.name, body.password).then(() => ({ ok: true }));
  }
}
