CREATE TABLE "member_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filter" jsonb NOT NULL,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_segments_party_id_id_key" UNIQUE("party_id","id"),
	CONSTRAINT "member_segments_party_name" UNIQUE("party_id","name")
);
--> statement-breakpoint
ALTER TABLE "member_segments" ADD CONSTRAINT "member_segments_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_segments" ADD CONSTRAINT "member_segments_created_by_member_id_fk" FOREIGN KEY ("party_id","created_by_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;