ALTER TABLE "files" ADD COLUMN "purpose" text DEFAULT 'document' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "upload_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "uploaded_by_member_id" uuid;