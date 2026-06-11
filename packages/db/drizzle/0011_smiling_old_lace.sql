ALTER TABLE "alert_channels" ADD COLUMN "min_severity" "event_severity" DEFAULT 'info' NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_channels" ADD COLUMN "tag_filter" text;