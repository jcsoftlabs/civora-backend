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
import { id, partyId, partyKey, sameParty, timestamps } from "./_helpers.js";
import { files } from "./content.js";
import { members } from "./people.js";
import { merchantAccounts } from "./tenancy.js";
import { zones } from "./territory.js";

export const periodicityEnum = pgEnum("periodicity", ["monthly", "quarterly", "semiannual", "annual", "once"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "succeeded", "failed", "refunded"]);

export const duesPlans = pgTable(
  "dues_plans",
  {
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
    /** Formule appliquée d'office à tout membre accepté ; sinon attribuée par un trésorier. */
    isDefault: boolean("is_default").notNull().default(false),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [partyKey("dues_plans", t)],
);

export const donationCampaigns = pgTable(
  "donation_campaigns",
  {
    id: id(),
    partyId: partyId(),
    title: jsonb("title").notNull(),
    goalAmount: numeric("goal_amount", { precision: 12, scale: 2 }),
    currency: text("currency").notNull(),
    recurringAllowed: boolean("recurring_allowed").notNull().default(true),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [partyKey("donation_campaigns", t)],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    partyId: partyId(),
    memberId: uuid("member_id"),
    kind: text("kind").notNull(), // dues | donation | special_contribution
    campaignId: uuid("campaign_id"),
    provider: text("provider").notNull(), // moncash | natcash | kashpaw | stripe | cash
    merchantAccountId: uuid("merchant_account_id"),
    providerRef: text("provider_ref"),
    idempotencyKey: text("idempotency_key").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    recordedByMemberId: uuid("recorded_by_member_id"), // espèces saisies par un trésorier (FIN-10)
    /** Échéances réglées par un paiement en ligne, réservées à la création et soldées à la confirmation. */
    obligationIds: uuid("obligation_ids").array().notNull().default([]),
    /** Lien de paiement chez le fournisseur et dernier état connu (vérification périodique, FIN-01). */
    providerStatus: text("provider_status"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    partyKey("payments", t),
    // Unicité par parti : une contrainte globale révélerait à un parti l'existence d'une clé chez un autre.
    unique("payments_party_idempotency_key").on(t.partyId, t.idempotencyKey),
    sameParty("payments", t.partyId, t.memberId, members),
    sameParty("payments", t.partyId, t.campaignId, donationCampaigns),
    sameParty("payments", t.partyId, t.merchantAccountId, merchantAccounts),
    sameParty("payments", t.partyId, t.recordedByMemberId, members),
  ],
);

/**
 * Formules suivies par chaque membre (FIN-03). Les échéances sont générées à partir de ces souscriptions :
 * un parti qui propose une formule « standard » et une formule « diaspora » ne fait pas payer les deux.
 */
export const duesSubscriptions = pgTable(
  "dues_subscriptions",
  {
    id: id(),
    partyId: partyId(),
    memberId: uuid("member_id").notNull(),
    planId: uuid("plan_id").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    ...timestamps,
  },
  (t) => [
    unique().on(t.partyId, t.memberId, t.planId),
    sameParty("dues_subscriptions", t.partyId, t.memberId, members),
    sameParty("dues_subscriptions", t.partyId, t.planId, duesPlans),
  ],
);

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
  (t) => [
    unique().on(t.partyId, t.memberId, t.planId, t.periodStart),
    sameParty("dues_obligations", t.partyId, t.memberId, members),
    sameParty("dues_obligations", t.partyId, t.planId, duesPlans),
    sameParty("dues_obligations", t.partyId, t.paymentId, payments),
  ],
);

export const receipts = pgTable(
  "receipts",
  {
    id: id(),
    partyId: partyId(),
    paymentId: uuid("payment_id").notNull(),
    number: text("number").notNull(),
    fileId: uuid("file_id"),
    ...timestamps,
  },
  (t) => [
    unique("receipts_party_number").on(t.partyId, t.number),
    sameParty("receipts", t.partyId, t.paymentId, payments),
    sameParty("receipts", t.partyId, t.fileId, files),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    partyId: partyId(),
    name: text("name").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    ...timestamps,
  },
  (t) => [partyKey("budgets", t)],
);

/** Journal des recettes et dépenses (CPT-01). */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: id(),
    partyId: partyId(),
    zoneId: uuid("zone_id").references(() => zones.id),
    direction: text("direction").notNull(), // in | out
    category: text("category").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    paymentId: uuid("payment_id"),
    budgetId: uuid("budget_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    sameParty("ledger_entries", t.partyId, t.paymentId, payments),
    sameParty("ledger_entries", t.partyId, t.budgetId, budgets),
  ],
);
