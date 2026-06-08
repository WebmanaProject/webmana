import { Module } from "@nestjs/common";
import { OrgController, InviteController } from "./org.controller.js";
import { OrgService } from "./org.service.js";

@Module({
  controllers: [OrgController, InviteController],
  providers: [OrgService],
})
export class OrgModule {}
