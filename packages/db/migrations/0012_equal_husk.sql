ALTER TABLE "parties" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "signup_draft" jsonb;