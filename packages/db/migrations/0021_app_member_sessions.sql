ALTER TABLE "sessions" ADD COLUMN "scope" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_scope" CHECK ("sessions"."scope" in ('full', 'member'));