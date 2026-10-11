CREATE TABLE "roll_contests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"election_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"concerned_member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_member_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roll_contests_kind" CHECK ("roll_contests"."kind" in ('missing', 'ineligible'))
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "status" text DEFAULT 'accepted' NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "decision_reason" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "runoff" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "election_results" ADD COLUMN "registered" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "election_results" ADD COLUMN "valid" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "election_results" ADD COLUMN "outcome" jsonb;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "description" jsonb;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "kind" text DEFAULT 'post' NOT NULL;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "zone_id" uuid;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "seats" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "round" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "candidacies_close_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "contestations_close_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "eligibility" jsonb;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "allow_blank" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "certified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN "certified_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "roll_contests" ADD CONSTRAINT "roll_contests_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roll_contests" ADD CONSTRAINT "roll_contests_election_id_fk" FOREIGN KEY ("party_id","election_id") REFERENCES "public"."elections"("party_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roll_contests" ADD CONSTRAINT "roll_contests_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roll_contests" ADD CONSTRAINT "roll_contests_concerned_member_id_fk" FOREIGN KEY ("party_id","concerned_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roll_contests" ADD CONSTRAINT "roll_contests_decided_by_member_id_fk" FOREIGN KEY ("party_id","decided_by_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_certified_by_member_id_fk" FOREIGN KEY ("party_id","certified_by_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_results" ADD CONSTRAINT "election_results_round" UNIQUE("party_id","election_id","round");--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_kind" CHECK ("elections"."kind" in ('post', 'question'));--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_seats" CHECK ("elections"."seats" between 1 and 50);