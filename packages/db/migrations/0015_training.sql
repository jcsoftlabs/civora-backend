CREATE TABLE "course_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"certificate_number" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_completions_member" UNIQUE("party_id","course_id","member_id"),
	CONSTRAINT "course_completions_number" UNIQUE("party_id","certificate_number")
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "description" jsonb;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "kind" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "body" jsonb;--> statement-breakpoint
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_course_id_fk" FOREIGN KEY ("party_id","course_id") REFERENCES "public"."courses"("party_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;