CREATE TABLE "certificate_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"title" jsonb,
	"mention" jsonb,
	"footer" jsonb,
	"accent_color" text,
	"show_logo" boolean DEFAULT true NOT NULL,
	"signatories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificate_templates_party" UNIQUE("party_id")
);
--> statement-breakpoint
CREATE TABLE "course_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" jsonb NOT NULL,
	"description" jsonb,
	"quiz" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_modules_party_id_id_key" UNIQUE("party_id","id")
);
--> statement-breakpoint
ALTER TABLE "lesson_attempts" ALTER COLUMN "lesson_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_attempts" ADD COLUMN "module_id" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "module_id" uuid;--> statement-breakpoint
-- Chapitres existants : un module par formation, qui reprend le titre de la formation.
INSERT INTO "course_modules" ("party_id", "course_id", "position", "title")
SELECT DISTINCT c."party_id", c."id", 1, c."title" FROM "courses" c JOIN "lessons" l ON l."course_id" = c."id";--> statement-breakpoint
UPDATE "lessons" l SET "module_id" = m."id" FROM "course_modules" m WHERE m."course_id" = l."course_id" AND m."party_id" = l."party_id";--> statement-breakpoint
ALTER TABLE "lessons" ALTER COLUMN "module_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "embed_url" text;--> statement-breakpoint
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_fk" FOREIGN KEY ("party_id","course_id") REFERENCES "public"."courses"("party_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_attempts" ADD CONSTRAINT "lesson_attempts_module_id_fk" FOREIGN KEY ("party_id","module_id") REFERENCES "public"."course_modules"("party_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_fk" FOREIGN KEY ("party_id","module_id") REFERENCES "public"."course_modules"("party_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_attempts" ADD CONSTRAINT "lesson_attempts_target" CHECK (("lesson_attempts"."lesson_id" is null) <> ("lesson_attempts"."module_id" is null));