CREATE TABLE "dues_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dues_subscriptions_party_id_member_id_plan_id_unique" UNIQUE("party_id","member_id","plan_id")
);
--> statement-breakpoint
ALTER TABLE "dues_plans" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dues_subscriptions" ADD CONSTRAINT "dues_subscriptions_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_subscriptions" ADD CONSTRAINT "dues_subscriptions_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues_subscriptions" ADD CONSTRAINT "dues_subscriptions_plan_id_fk" FOREIGN KEY ("party_id","plan_id") REFERENCES "public"."dues_plans"("party_id","id") ON DELETE no action ON UPDATE no action;