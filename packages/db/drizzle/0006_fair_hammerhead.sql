ALTER TABLE "domains" ADD COLUMN "purchase_cost" double precision;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "purchase_date" date;--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "purchase_cost";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "renewal_cost";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "cost_currency";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "purchase_date";