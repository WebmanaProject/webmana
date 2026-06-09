ALTER TABLE "projects" ADD COLUMN "purchase_cost" double precision;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "renewal_cost" double precision;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "cost_currency" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "purchase_date" date;