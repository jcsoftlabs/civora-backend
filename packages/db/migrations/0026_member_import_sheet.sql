ALTER TABLE "member_imports" ALTER COLUMN "file_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "member_imports" ADD COLUMN "sheet_url" text;