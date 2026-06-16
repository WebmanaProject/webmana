import { Body, Controller, Get, Post, Put, UseGuards } from "@nestjs/common";
import { AiService, type SaveAiSettingsInput, type ChatMessage } from "./ai.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { RolesGuard, Roles } from "../auth/roles.guard.js";

/** AI provider settings + the portfolio assistant. */
@Controller("ai")
@UseGuards(AuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get("settings")
  settings() {
    return this.ai.getSettings();
  }

  @Put("settings")
  @UseGuards(RolesGuard)
  @Roles("admin")
  save(@Body() body: SaveAiSettingsInput) {
    return this.ai.saveSettings(body ?? {});
  }

  @Post("chat")
  chat(@Body() body: { messages?: ChatMessage[] }) {
    return this.ai.chat(Array.isArray(body?.messages) ? body.messages : []);
  }
}
