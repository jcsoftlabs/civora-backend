// ADH-01 à ADH-12, SEC-02
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { encrypted, id, partyId, partyKey, sameParty, timestamps } from "./_helpers.js";
import { files } from "./content.js";
import { zones } from "./territory.js";

/**
 * Identité de connexion, globale : un compte adhère à un seul parti (members.user_id unique).
 * Connexion par code à usage unique envoyé par e-mail (par défaut) ou par SMS si le parti l'a activé :
 * le coût des SMS est un choix du parti (parties.otp_channels).
 */
export const users = pgTable(
  "users",
  {
    id: id(),
    phoneE164: text("phone_e164").unique(),
    /** Toujours en minuscules, sans espaces (normalisé par l'API). */
    email: text("email").unique(),
    locale: text("locale").notNull().default("fr"),
    ...timestamps,
  },
  (t) => [check("users_contact_required", sql`${t.email} is not null or ${t.phoneE164} is not null`)],
);

export const memberStatuses = pgTable(
  "member_statuses",
  {
    id: id(),
    partyId: partyId(),
    label: jsonb("label").notNull(), // I18nText
    rank: integer("rank").notNull(),
    ...timestamps,
  },
  (t) => [partyKey("member_statuses", t)],
);

export const applicationStateEnum = pgEnum("application_state", ["pending", "approved", "rejected"]);

export const members = pgTable(
  "members",
  {
    id: id(),
    partyId: partyId(),
    userId: uuid("user_id").references(() => users.id),
    memberNumber: text("member_number").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    birthDate: date("birth_date"),
    phoneE164: text("phone_e164"),
    photoFileId: uuid("photo_file_id"),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zones.id), // section communale ou ville de diaspora
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
  (t) => [
    unique().on(t.partyId, t.memberNumber),
    index("members_party_zone").on(t.partyId, t.zoneId),
    partyKey("members", t),
    // Un compte n'appartient qu'à un seul parti (une adhésion par personne).
    unique("members_user_id_key").on(t.userId),
    sameParty("members", t.partyId, t.photoFileId, files),
    sameParty("members", t.partyId, t.statusId, memberStatuses),
    sameParty("members", t.partyId, t.referentMemberId, t),
  ],
);

/** Pièces d'identité chiffrées, empreinte HMAC pour les doublons (ADH-08). */
export const memberIdentities = pgTable(
  "member_identities",
  {
    id: id(),
    partyId: partyId(),
    memberId: uuid("member_id").notNull(),
    kind: text("kind").notNull(), // nin | nif | passport | ssn
    valueEncrypted: encrypted("value_encrypted").notNull(),
    valueHmac: text("value_hmac").notNull(),
    keyVersion: integer("key_version").notNull(),
    ...timestamps,
  },
  (t) => [sameParty("member_identities", t.partyId, t.memberId, members)],
);

/** Parrainages (ADH-05, ENG-01). */
export const referrals = pgTable(
  "referrals",
  {
    id: id(),
    partyId: partyId(),
    sponsorMemberId: uuid("sponsor_member_id").notNull(),
    referredMemberId: uuid("referred_member_id").notNull(),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    sameParty("referrals", t.partyId, t.sponsorMemberId, members),
    sameParty("referrals", t.partyId, t.referredMemberId, members),
  ],
);

/** Imports de fichiers (ADH-07 à ADH-10). */
export const memberImports = pgTable(
  "member_imports",
  {
    id: id(),
    partyId: partyId(),
    fileId: uuid("file_id").notNull(),
    columnMapping: jsonb("column_mapping").notNull(),
    state: text("state").notNull().default("preview"), // preview | running | done | failed
    report: jsonb("report"), // erreurs ligne par ligne, doublons
    ...timestamps,
  },
  (t) => [sameParty("member_imports", t.partyId, t.fileId, files)],
);

/**
 * Segments enregistrés de la liste des membres (ADH-12, maquette « liste des membres ») : un filtre nommé,
 * partagé avec les responsables du parti. La portée territoriale s'applique toujours à la lecture.
 */
export const memberSegments = pgTable(
  "member_segments",
  {
    id: id(),
    partyId: partyId(),
    name: text("name").notNull(),
    /** { combinator: "and" | "or", rules: [{ field, operator, value }] } */
    filter: jsonb("filter").notNull(),
    createdByMemberId: uuid("created_by_member_id"),
    ...timestamps,
  },
  (t) => [
    partyKey("member_segments", t),
    unique("member_segments_party_name").on(t.partyId, t.name),
    sameParty("member_segments", t.partyId, t.createdByMemberId, members),
  ],
);
