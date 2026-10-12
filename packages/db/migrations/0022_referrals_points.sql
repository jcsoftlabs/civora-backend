CREATE TABLE "point_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"action" text NOT NULL,
	"points" integer NOT NULL,
	"reference_id" uuid,
	"note" text,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_entries_once" UNIQUE("party_id","member_id","action","reference_id"),
	CONSTRAINT "point_entries_action" CHECK ("point_entries"."action" in ('referral', 'training', 'vote', 'dues', 'attendance', 'manual'))
);
--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "points_scale" jsonb;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_created_by_member_id_fk" FOREIGN KEY ("party_id","created_by_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "point_entries_member" ON "point_entries" USING btree ("party_id","member_id");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_referral_code_key" UNIQUE("party_id","referral_code");