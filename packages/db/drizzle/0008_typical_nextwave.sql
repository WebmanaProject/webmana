CREATE TYPE "public"."budget_period" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."budget_scope" AS ENUM('project', 'tag', 'org');--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scope" "budget_scope" NOT NULL,
	"ref" text,
	"period" "budget_period" DEFAULT 'monthly' NOT NULL,
	"amount" double precision NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budgets_org_idx" ON "budgets" USING btree ("organization_id");