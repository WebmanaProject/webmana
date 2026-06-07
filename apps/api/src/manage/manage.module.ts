import { Module } from "@nestjs/common";
import { ManageController } from "./manage.controller.js";
import { ManageService } from "./manage.service.js";

@Module({
  controllers: [ManageController],
  providers: [ManageService],
})
export class ManageModule {}
