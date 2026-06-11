import { Controller, Get, Header } from "@nestjs/common";
import { StatusService } from "./status.service.js";

@Controller("status")
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Get()
  page() {
    return this.status.getStatusPage();
  }

  /** Public RSS feed of recent incidents — subscribe in any reader. */
  @Get("rss")
  @Header("content-type", "application/rss+xml; charset=utf-8")
  rss() {
    return this.status.getRssFeed(process.env.WEB_ORIGIN ?? "http://localhost:3000");
  }
}
