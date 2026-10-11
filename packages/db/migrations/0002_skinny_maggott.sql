ALTER TABLE "dues_obligations" DROP CONSTRAINT "dues_obligations_member_id_plan_id_period_start_unique";--> statement-breakpoint
ALTER TABLE "attendances" DROP CONSTRAINT "attendances_event_id_member_id_unique";--> statement-breakpoint
ALTER TABLE "event_registrations" DROP CONSTRAINT "event_registrations_event_id_member_id_unique";--> statement-breakpoint
ALTER TABLE "member_badges" DROP CONSTRAINT "member_badges_member_id_badge_id_unique";--> statement-breakpoint
ALTER TABLE "survey_responses" DROP CONSTRAINT "survey_responses_survey_id_member_id_unique";--> statement-breakpoint
ALTER TABLE "ballot_receipts" DROP CONSTRAINT "ballot_receipts_election_id_member_id_round_unique";--> statement-breakpoint
ALTER TABLE "electoral_rolls" DROP CONSTRAINT "electoral_rolls_election_id_member_id_unique";--> statement-breakpoint
ALTER TABLE "polling_stations" DROP CONSTRAINT "polling_stations_center_id_code_unique";--> statement-breakpoint
ALTER TABLE "dues_obligations" ADD CONSTRAINT "dues_obligations_party_id_member_id_plan_id_period_start_unique" UNIQUE("party_id","member_id","plan_id","period_start");--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_party_id_event_id_member_id_unique" UNIQUE("party_id","event_id","member_id");--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_party_id_event_id_member_id_unique" UNIQUE("party_id","event_id","member_id");--> statement-breakpoint
ALTER TABLE "member_badges" ADD CONSTRAINT "member_badges_party_id_member_id_badge_id_unique" UNIQUE("party_id","member_id","badge_id");--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_party_id_survey_id_member_id_unique" UNIQUE("party_id","survey_id","member_id");--> statement-breakpoint
ALTER TABLE "ballot_receipts" ADD CONSTRAINT "ballot_receipts_party_id_election_id_member_id_round_unique" UNIQUE("party_id","election_id","member_id","round");--> statement-breakpoint
ALTER TABLE "electoral_rolls" ADD CONSTRAINT "electoral_rolls_party_id_election_id_member_id_unique" UNIQUE("party_id","election_id","member_id");--> statement-breakpoint
ALTER TABLE "polling_stations" ADD CONSTRAINT "polling_stations_party_id_center_id_code_unique" UNIQUE("party_id","center_id","code");