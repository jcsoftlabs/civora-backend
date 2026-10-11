// ADH-01 à ADH-12, SEC-02
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { encrypted, id, partyId, timestamps } from "./_helpers.js";

/** Identité de connexion, globale : une personne peut appartenir à un seul parti à la fois par défaut. */
export const users = pgTable("users", {
  id: id(),
  phoneE164: text("phone_e164").notNull().unique(),
  email: text("email"),
  locale: text("locale").notNull().default("fr"),
  twoFactorSecret: encrypted("two_factor_secret"),
  ...timestamps,
});

export const memberStatuses = pgTable("member_statuses", {
  id: id(),
  partyId: partyId(),
  label: jsonb("label").notNull(), // I18nText
  rank: integer("rank").notNull(),
  ...timestamps,
});

export const applicationStateEnum = pgEnum("application_state", ["pending", "approved", "rejected"]);

export const members = pgTable(
  "members",
  {
    id: id(),
    partyId: partyId(),
    userId: uuid("user_id"),
    memberNumber: text("member_number").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    birthDate: date("birth_date"),
    phoneE164: text("phone_e164"),
    photoFileId: uuid("photo_file_id"),
    zoneId: uuid("zone_id").notNull(), // section communale ou ville de diaspora
    isDiaspora: boolean("is_diaspora").notNull().default(false),
    residenceCountry: text("residence_country"),
    statusId: uuid("status_id"),
    category: text("category"), // étudiant, diaspora, élu... (FIN-04)
    referentMemberId: uuid("referent_member_id"),
    applicationState: applicationStateEnum("application_state").notNull().default("pending"),
    applicationScore: integer("application_score"),
    tags: text("tags").array().notNull().default([]),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [unique().on(t.partyId, t.memberNumber), index("members_party_zone").on(t.partyId, t.zoneId)],
);

/** Pièces d'identité chiffrées, empreinte HMAC pour les doublons (ADH-08). */
export const memberIdentities = pgTable("member_identities", {
  id: id(),
  partyId: partyId(),
  memberId: uuid("member_id").notNull(),
  kind: text("kind").notNull(), // nin | nif | passport | ssn
  valueEncrypted: encrypted("value_encrypted").notNull(),
  valueHmac: text("value_hmac").notNull(),
  keyVersion: integer("key_version").notNull(),
  ...timestamps,
});

/** Parrainages (ADH-05, ENG-01). */
export const referrals = pgTable("referrals", {
  id: id(),
  partyId: partyId(),
  sponsorMemberId: uuid("sponsor_member_id").notNull(),
  referredMemberId: uuid("referred_member_id").notNull(),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  ...timestamps,
});

/** Imports de fichiers (ADH-07 à ADH-10). */
export const memberImports = pgTable("member_imports", {
  id: id(),
  partyId: partyId(),
  fileId: uuid("file_id").notNull(),
  columnMapping: jsonb("column_mapping").notNull(),
  state: text("state").notNull().default("preview"), // preview | running | done | failed
  report: jsonb("report"), // erreurs ligne par ligne, doublons
  ...timestamps,
});
