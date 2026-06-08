CREATE TYPE "public"."project_status" AS ENUM('idea', 'in_progress', 'rebuild', 'live', 'paused', 'archived');--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "domain" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status" "project_status" DEFAULT 'idea' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "links" jsonb DEFAULT '{}'::jsonb NOT NULL;