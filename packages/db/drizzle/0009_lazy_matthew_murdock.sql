CREATE TYPE "public"."incident_status" AS ENUM('open', 'acknowledged', 'resolved');--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"severity" "event_severity" DEFAULT 'warning' NOT NULL,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidents_org_status_idx" ON "incidents" USING btree ("organization_id","status","created_at");