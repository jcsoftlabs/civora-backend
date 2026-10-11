-- Clés étrangères (SOC-02) : les UNIQUE (party_id, id) doivent exister avant les clés composites qui les visent.
ALTER TABLE "payments" DROP CONSTRAINT "payments_idempotency_key_unique";
--> statement-breakpoint
ALTER TABLE "merchant_accounts" ADD CONSTRAINT "merchant_accounts_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "member_statuses" ADD CONSTRAINT "member_statuses_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_key" UNIQUE("user_id");
--> statement-breakpoint
ALTER TABLE "organs" ADD CONSTRAINT "organs_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "donation_campaigns" ADD CONSTRAINT "donation_campaigns_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "dues_plans" ADD CONSTRAINT "dues_plans_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_party_idempotency_key" UNIQUE("party_id","idempotency_key");
--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_party_number" UNIQUE("party_id","number");
--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_member_id_unique" UNIQUE("event_id","member_id");
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "member_badges" ADD CONSTRAINT "member_badges_member_id_badge_id_unique" UNIQUE("member_id","badge_id");
--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_member_id_unique" UNIQUE("survey_id","member_id");
--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "election_cycles" ADD CONSTRAINT "election_cycles_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "polling_centers" ADD CONSTRAINT "polling_centers_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "polling_stations" ADD CONSTRAINT "polling_stations_party_id_id_key" UNIQUE("party_id","id");
--> statement-breakpoint
ALTER TABLE "polling_stations" ADD CONSTRAINT "polling_stations_center_id_code_unique" UNIQUE("center_id","code");
--> statement-breakpoint
ALTER TABLE "merchant_accounts" ADD CONSTRAINT "merchant_accounts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_logo_file_id_fk" FOREIGN KEY ("id","logo_file_id") REFERENCES "public"."files"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "party_domains" ADD CONSTRAINT "party_domains_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "party_keys" ADD CONSTRAINT "party_keys_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "usage_snapshots" ADD CONSTRAINT "usage_snapshots_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_parent_id_zones_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_identities" ADD CONSTRAINT "member_identities_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_identities" ADD CONSTRAINT "member_identities_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_imports" ADD CONSTRAINT "member_imports_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_imports" ADD CONSTRAINT "member_imports_file_id_fk" FOREIGN KEY ("party_id","file_id") REFERENCES "public"."files"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_statuses" ADD CONSTRAINT "member_statuses_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_photo_file_id_fk" FOREIGN KEY ("party_id","photo_file_id") REFERENCES "public"."files"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_status_id_fk" FOREIGN KEY ("party_id","status_id") REFERENCES "public"."member_statuses"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_referent_member_id_fk" FOREIGN KEY ("party_id","referent_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_sponsor_member_id_fk" FOREIGN KEY ("party_id","sponsor_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_member_id_fk" FOREIGN KEY ("party_id","referred_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organ_members" ADD CONSTRAINT "organ_members_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organ_members" ADD CONSTRAINT "organ_members_organ_id_fk" FOREIGN KEY ("party_id","organ_id") REFERENCES "public"."organs"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organ_members" ADD CONSTRAINT "organ_members_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organs" ADD CONSTRAINT "organs_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organs" ADD CONSTRAINT "organs_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organs" ADD CONSTRAINT "organs_parent_organ_id_fk" FOREIGN KEY ("party_id","parent_organ_id") REFERENCES "public"."organs"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_holders" ADD CONSTRAINT "post_holders_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_holders" ADD CONSTRAINT "post_holders_post_id_fk" FOREIGN KEY ("party_id","post_id") REFERENCES "public"."posts"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_holders" ADD CONSTRAINT "post_holders_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_holders" ADD CONSTRAINT "post_holders_source_election_id_fk" FOREIGN KEY ("party_id","source_election_id") REFERENCES "public"."elections"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_scope_zone_id_zones_id_fk" FOREIGN KEY ("scope_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_organ_id_fk" FOREIGN KEY ("party_id","organ_id") REFERENCES "public"."organs"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "donation_campaigns" ADD CONSTRAINT "donation_campaigns_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dues_obligations" ADD CONSTRAINT "dues_obligations_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dues_obligations" ADD CONSTRAINT "dues_obligations_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dues_obligations" ADD CONSTRAINT "dues_obligations_plan_id_fk" FOREIGN KEY ("party_id","plan_id") REFERENCES "public"."dues_plans"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dues_obligations" ADD CONSTRAINT "dues_obligations_payment_id_fk" FOREIGN KEY ("party_id","payment_id") REFERENCES "public"."payments"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dues_plans" ADD CONSTRAINT "dues_plans_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_fk" FOREIGN KEY ("party_id","payment_id") REFERENCES "public"."payments"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_budget_id_fk" FOREIGN KEY ("party_id","budget_id") REFERENCES "public"."budgets"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_campaign_id_fk" FOREIGN KEY ("party_id","campaign_id") REFERENCES "public"."donation_campaigns"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_merchant_account_id_fk" FOREIGN KEY ("party_id","merchant_account_id") REFERENCES "public"."merchant_accounts"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_member_id_fk" FOREIGN KEY ("party_id","recorded_by_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_fk" FOREIGN KEY ("party_id","payment_id") REFERENCES "public"."payments"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_file_id_fk" FOREIGN KEY ("party_id","file_id") REFERENCES "public"."files"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_event_id_fk" FOREIGN KEY ("party_id","event_id") REFERENCES "public"."events"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_scanned_by_member_id_fk" FOREIGN KEY ("party_id","scanned_by_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_fk" FOREIGN KEY ("party_id","event_id") REFERENCES "public"."events"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organ_id_fk" FOREIGN KEY ("party_id","organ_id") REFERENCES "public"."organs"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_badges" ADD CONSTRAINT "member_badges_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_badges" ADD CONSTRAINT "member_badges_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_badges" ADD CONSTRAINT "member_badges_badge_id_fk" FOREIGN KEY ("party_id","badge_id") REFERENCES "public"."badges"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_corrected_by_member_id_fk" FOREIGN KEY ("party_id","corrected_by_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "point_rules" ADD CONSTRAINT "point_rules_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_granted_by_member_id_fk" FOREIGN KEY ("party_id","granted_by_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_fk" FOREIGN KEY ("party_id","survey_id") REFERENCES "public"."surveys"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ballot_receipts" ADD CONSTRAINT "ballot_receipts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ballot_receipts" ADD CONSTRAINT "ballot_receipts_election_id_fk" FOREIGN KEY ("party_id","election_id") REFERENCES "public"."elections"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ballot_receipts" ADD CONSTRAINT "ballot_receipts_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_election_id_fk" FOREIGN KEY ("party_id","election_id") REFERENCES "public"."elections"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_election_id_fk" FOREIGN KEY ("party_id","election_id") REFERENCES "public"."elections"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "election_results" ADD CONSTRAINT "election_results_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "election_results" ADD CONSTRAINT "election_results_election_id_fk" FOREIGN KEY ("party_id","election_id") REFERENCES "public"."elections"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "election_results" ADD CONSTRAINT "election_results_minutes_file_id_fk" FOREIGN KEY ("party_id","minutes_file_id") REFERENCES "public"."files"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_post_id_fk" FOREIGN KEY ("party_id","post_id") REFERENCES "public"."posts"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "electoral_rolls" ADD CONSTRAINT "electoral_rolls_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "electoral_rolls" ADD CONSTRAINT "electoral_rolls_election_id_fk" FOREIGN KEY ("party_id","election_id") REFERENCES "public"."elections"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "electoral_rolls" ADD CONSTRAINT "electoral_rolls_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organ_id_fk" FOREIGN KEY ("party_id","organ_id") REFERENCES "public"."organs"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organ_id_fk" FOREIGN KEY ("party_id","organ_id") REFERENCES "public"."organs"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_previous_version_id_fk" FOREIGN KEY ("party_id","previous_version_id") REFERENCES "public"."files"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lesson_attempts" ADD CONSTRAINT "lesson_attempts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lesson_attempts" ADD CONSTRAINT "lesson_attempts_lesson_id_fk" FOREIGN KEY ("party_id","lesson_id") REFERENCES "public"."lessons"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lesson_attempts" ADD CONSTRAINT "lesson_attempts_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_fk" FOREIGN KEY ("party_id","course_id") REFERENCES "public"."courses"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_media_file_id_fk" FOREIGN KEY ("party_id","media_file_id") REFERENCES "public"."files"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fk" FOREIGN KEY ("party_id","conversation_id") REFERENCES "public"."conversations"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_member_id_fk" FOREIGN KEY ("party_id","author_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD CONSTRAINT "outreach_campaigns_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saved_segments" ADD CONSTRAINT "saved_segments_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "candidacy_files" ADD CONSTRAINT "candidacy_files_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "candidacy_files" ADD CONSTRAINT "candidacy_files_cycle_id_fk" FOREIGN KEY ("party_id","cycle_id") REFERENCES "public"."election_cycles"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "candidacy_files" ADD CONSTRAINT "candidacy_files_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "canvass_contacts" ADD CONSTRAINT "canvass_contacts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "canvass_contacts" ADD CONSTRAINT "canvass_contacts_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "canvass_contacts" ADD CONSTRAINT "canvass_contacts_assigned_member_id_fk" FOREIGN KEY ("party_id","assigned_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "election_cycles" ADD CONSTRAINT "election_cycles_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_station_id_fk" FOREIGN KEY ("party_id","station_id") REFERENCES "public"."polling_stations"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_photo_file_id_fk" FOREIGN KEY ("party_id","photo_file_id") REFERENCES "public"."files"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_member_id_fk" FOREIGN KEY ("party_id","reported_by_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "observer_assignments" ADD CONSTRAINT "observer_assignments_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "observer_assignments" ADD CONSTRAINT "observer_assignments_station_id_fk" FOREIGN KEY ("party_id","station_id") REFERENCES "public"."polling_stations"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "observer_assignments" ADD CONSTRAINT "observer_assignments_member_id_fk" FOREIGN KEY ("party_id","member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "polling_centers" ADD CONSTRAINT "polling_centers_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "polling_centers" ADD CONSTRAINT "polling_centers_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "polling_centers" ADD CONSTRAINT "polling_centers_cycle_id_fk" FOREIGN KEY ("party_id","cycle_id") REFERENCES "public"."election_cycles"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "polling_centers" ADD CONSTRAINT "polling_centers_supervisor_member_id_fk" FOREIGN KEY ("party_id","supervisor_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "polling_stations" ADD CONSTRAINT "polling_stations_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "polling_stations" ADD CONSTRAINT "polling_stations_center_id_fk" FOREIGN KEY ("party_id","center_id") REFERENCES "public"."polling_centers"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tally_sheets" ADD CONSTRAINT "tally_sheets_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tally_sheets" ADD CONSTRAINT "tally_sheets_station_id_fk" FOREIGN KEY ("party_id","station_id") REFERENCES "public"."polling_stations"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tally_sheets" ADD CONSTRAINT "tally_sheets_photo_file_id_fk" FOREIGN KEY ("party_id","photo_file_id") REFERENCES "public"."files"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tally_sheets" ADD CONSTRAINT "tally_sheets_entered_by_member_id_fk" FOREIGN KEY ("party_id","entered_by_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tally_sheets" ADD CONSTRAINT "tally_sheets_validated_by_member_id_fk" FOREIGN KEY ("party_id","validated_by_member_id") REFERENCES "public"."members"("party_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_api_keys" ADD CONSTRAINT "data_api_keys_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_access_requests" ADD CONSTRAINT "staff_access_requests_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;
