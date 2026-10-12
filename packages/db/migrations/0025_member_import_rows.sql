CREATE TABLE "member_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"line" integer NOT NULL,
	"data" jsonb NOT NULL,
	"zone_id" uuid,
	"issues" text[] DEFAULT '{}' NOT NULL,
	"duplicate_member_id" uuid,
	"duplicate_reason" text,
	"decision" text DEFAULT 'create' NOT NULL,
	"result" text,
	"member_id" uuid,
	"invited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_import_rows_line_key" UNIQUE("party_id","import_id","line")
);
--> statement-breakpoint
ALTER TABLE "member_imports" ADD COLUMN "source" text DEFAULT 'file' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_imports" ADD COLUMN "created_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "member_imports" ADD COLUMN "invite_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_imports" ADD CONSTRAINT "member_imports_party_id_id_key" UNIQUE("party_id","id");--> statement-breakpoint
ALTER TABLE "member_import_rows" ADD CONSTRAINT "member_import_rows_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_import_rows" ADD CONSTRAINT "member_import_rows_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_import_rows" ADD CONSTRAINT "member_import_rows_import_id_fk" FOREIGN KEY ("party_id","import_id") REFERENCES "public"."member_imports"("party_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_import_rows" ADD CONSTRAINT "member_import_rows_duplicate_member_id_fk" FOREIGN KEY ("party_id","duplicate_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_import_rows" ADD CONSTRAINT "member_import_rows_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_import_rows_pending" ON "member_import_rows" USING btree ("import_id","result");--> statement-breakpoint
ALTER TABLE "member_imports" ADD CONSTRAINT "member_imports_created_by_member_id_fk" FOREIGN KEY ("party_id","created_by_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;