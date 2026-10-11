ALTER TYPE "public"."zone_level" ADD VALUE 'diaspora' BEFORE 'diaspora_pays';--> statement-breakpoint
ALTER TABLE "zones" ADD COLUMN "name_ht" text;