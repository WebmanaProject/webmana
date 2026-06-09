CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"fqdn" text NOT NULL,
	"registrar" text,
	"expires_at" date,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"nameservers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"renewal_cost" double precision,
	"cost_currency" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_domains" (
	"project_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "project_domains_project_id_domain_id_pk" PRIMARY KEY("project_id","domain_id")
);
--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_domains" ADD CONSTRAINT "project_domains_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_domains" ADD CONSTRAINT "project_domains_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "domains_org_fqdn_idx" ON "domains" USING btree ("organization_id","fqdn");--> statement-breakpoint
CREATE INDEX "domains_expires_idx" ON "domains" USING btree ("expires_at");