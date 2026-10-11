// SOC-01, SOC-03, SOC-04, SOC-07, SOC-08, SEC-02
import {
  bigint,
  boolean,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { encrypted, id, partyId, partyKey, timestamps } from "./_helpers.js";
import { files } from "./content.js";

export const tierEnum = pgEnum("tier", ["essentiel", "mouvement", "national"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trial",
  "active",
  "past_due",
  "suspended",
  "cancelled",
]);

/** Un parti client. La politique RLS de cette table compare id à app.party_id. */
export const parties = pgTable(
  "parties",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    logoFileId: uuid("logo_file_id"),
    brandColor: text("brand_color").notNull().default("#0F6E66"),
    languages: text("languages").array().notNull().default(["fr", "ht"]),
    tier: tierEnum("tier").notNull().default("essentiel"),
    electionsModuleUntil: timestamp("elections_module_until", { withTimezone: true }),
    /** Mode d'adhésion (ADH-04) : libre, validation, parrainage. */
    admissionMode: text("admission_mode").notNull().default("validation"),
    referralSettings: jsonb("referral_settings"),
    ...timestamps,
  },
  // Le logo est un fichier du parti lui-même.
  (t) => [
    foreignKey({
      name: "parties_logo_file_id_fk",
      columns: [t.id, t.logoFileId],
      foreignColumns: [files.partyId, files.id],
    }),
  ],
);

export const partyDomains = pgTable("party_domains", {
  id: id(),
  partyId: partyId(),
  hostname: text("hostname").notNull().unique(),
  verified: boolean("verified").notNull().default(false),
  ...timestamps,
});

/** Clé de données du parti, chiffrée par la clé maîtresse (enveloppe). */
export const partyKeys = pgTable("party_keys", {
  id: id(),
  partyId: partyId(),
  wrappedKey: encrypted("wrapped_key").notNull(),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** Comptes marchands du parti : les fonds y arrivent directement (FIN-12). */
export const merchantAccounts = pgTable(
  "merchant_accounts",
  {
    id: id(),
    partyId: partyId(),
    provider: text("provider").notNull(), // moncash | natcash | kashpaw | stripe
    credentialsRef: text("credentials_ref").notNull(), // référence dans le gestionnaire de secrets, jamais la valeur
    currency: text("currency").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [partyKey("merchant_accounts", t)],
);

/** Abonnement à la plateforme (SOC-08). */
export const subscriptions = pgTable("subscriptions", {
  id: id(),
  partyId: partyId(),
  tier: tierEnum("tier").notNull(),
  status: subscriptionStatusEnum("status").notNull().default("trial"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  extraStoragePacks: integer("extra_storage_packs").notNull().default(0),
  biConnectorOption: boolean("bi_connector_option").notNull().default(false),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  ...timestamps,
});

/** Relevé quotidien de consommation (DOC-04, SOC-08). */
export const usageSnapshots = pgTable("usage_snapshots", {
  id: id(),
  partyId: partyId(),
  day: timestamp("day", { withTimezone: true }).notNull(),
  activeMembers: integer("active_members").notNull(),
  storageBytes: bigint("storage_bytes", { mode: "number" }).notNull(),
  smsSent: integer("sms_sent").notNull().default(0),
  whatsappSent: integer("whatsapp_sent").notNull().default(0),
  emailsSent: integer("emails_sent").notNull().default(0),
});
