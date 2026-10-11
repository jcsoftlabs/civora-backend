// FIN-01 à FIN-12, CPT-01 à CPT-04
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, partyId, timestamps } from "./_helpers.js";

export const periodicityEnum = pgEnum("periodicity", ["monthly", "quarterly", "semiannual", "annual", "once"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "succeeded", "failed", "refunded"]);

export const duesPlans = pgTable("dues_plans", {
  id: id(),
  partyId: partyId(),
  name: jsonb("name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull(), // HTG | USD | EUR | CAD
  periodicity: periodicityEnum("periodicity").notNull(),
  dueRule: text("due_rule").notNull().default("anniversary"), // anniversary | fixed (FIN-05)
  fixedDueDay: text("fixed_due_day"), // MM-DD
  graceDays: integer("grace_days").notNull().default(15),
  eligibility: jsonb("eligibility"), // statut, catégorie, zone (FIN-04)
  lateEffects: jsonb("late_effects"), // perte du vote, candidature, contenus (FIN-07)
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** Échéances générées par membre. */
export const duesObligations = pgTable(
  "dues_obligations",
  {
    id: id(),
    partyId: partyId(),
    memberId: uuid("member_id").notNull(),
    planId: uuid("plan_id").notNull(),
    periodStart: date("period_start").notNull(),
    dueDate: date("due_date").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paymentId: uuid("payment_id"),
    ...timestamps,
  },
  (t) => [unique().on(t.memberId, t.planId, t.periodStart)],
);

export const donationCampaigns = pgTable("donation_campaigns", {
  id: id(),
  partyId: partyId(),
  title: jsonb("title").notNull(),
  goalAmount: numeric("goal_amount", { precision: 12, scale: 2 }),
  currency: text("currency").notNull(),
  recurringAllowed: boolean("recurring_allowed").notNull().default(true),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  ...timestamps,
});

export const payments = pgTable("payments", {
  id: id(),
  partyId: partyId(),
  memberId: uuid("member_id"),
  kind: text("kind").notNull(), // dues | donation | special_contribution
  campaignId: uuid("campaign_id"),
  provider: text("provider").notNull(), // moncash | natcash | kashpaw | stripe | cash
  merchantAccountId: uuid("merchant_account_id"),
  providerRef: text("provider_ref"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  status: paymentStatusEnum("status").notNull().default("pending"),
  recordedByMemberId: uuid("recorded_by_member_id"), // espèces saisies par un trésorier (FIN-10)
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  ...timestamps,
});

export const receipts = pgTable("receipts", {
  id: id(),
  partyId: partyId(),
  paymentId: uuid("payment_id").notNull(),
  number: text("number").notNull(),
  fileId: uuid("file_id"),
  ...timestamps,
});

/** Journal des recettes et dépenses (CPT-01). */
export const ledgerEntries = pgTable("ledger_entries", {
  id: id(),
  partyId: partyId(),
  zoneId: uuid("zone_id"),
  direction: text("direction").notNull(), // in | out
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  paymentId: uuid("payment_id"),
  budgetId: uuid("budget_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const budgets = pgTable("budgets", {
  id: id(),
  partyId: partyId(),
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  ...timestamps,
});
