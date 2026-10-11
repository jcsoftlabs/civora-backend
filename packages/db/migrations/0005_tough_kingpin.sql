ALTER TABLE "audit_log" ADD COLUMN "seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "prev_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_party_seq" UNIQUE("party_id","seq");