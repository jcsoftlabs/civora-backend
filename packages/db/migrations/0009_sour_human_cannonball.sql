ALTER TABLE "payments" ADD COLUMN "obligation_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_status" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "last_checked_at" timestamp with time zone;