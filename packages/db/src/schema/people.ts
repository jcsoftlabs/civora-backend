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
    /** Code de parrainage (ENG-01), attribué à chaque membre validé quand le parti active le parrainage. */
    referralCode: text("referral_code"),
    applicationState: applicationStateEnum("application_state").notNull().default("pending"),
    applicationScore: integer("application_score"),
    tags: text("tags").array().notNull().default([]),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique().on(t.partyId, t.memberNumber),
    unique("members_referral_code_key").on(t.partyId, t.referralCode),
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
    /** Fichier déposé (Excel ou CSV) ; absent pour une feuille Google Sheets, lue par son adresse. */
    fileId: uuid("file_id"),
    sheetUrl: text("sheet_url"),
    /** Réglages de l'assistant : colonnes associées aux champs, zones corrigées, statut par défaut. */
    columnMapping: jsonb("column_mapping").notNull(),
    /** mapping | preview | queued | running | done | failed */
    state: text("state").notNull().default("preview"),
    /** Synthèse : lignes, valides, erreurs par motif, doublons, zones inconnues, résultat. Jamais de pièce d'identité. */
    report: jsonb("report"),
    /** file (Excel ou CSV déposé) | sheet (Google Sheets, lu en CSV) */
    source: text("source").notNull().default("file"),
    /** members (fichier de membres, ADH-07) | dues (historique des cotisations, ADH-10) */
    kind: text("kind").notNull().default("members"),
    createdByMemberId: uuid("created_by_member_id"),
    /** Invitations par e-mail demandées (ADH-09) : le worker les envoie par lots. */
    inviteRequestedAt: timestamp("invite_requested_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    partyKey("member_imports", t),
    sameParty("member_imports", t.partyId, t.fileId, files),
    sameParty("member_imports", t.partyId, t.createdByMemberId, members),
  ],
);

/**
 * Lignes d'un import, figées à l'aperçu (ADH-07, ADH-08) : données normalisées (la pièce d'identité scellée avec la
 * clé du parti, jamais en clair), zone retrouvée, problèmes, doublon et décision ; puis le résultat du worker.
 * Chaque ligne n'est traitée qu'une fois : un import interrompu reprend où il s'était arrêté.
 */
export const memberImportRows = pgTable(
  "member_import_rows",
  {
    id: id(),
    partyId: partyId(),
    importId: uuid("import_id").notNull(),
    /** Numéro de ligne dans le fichier (en-tête = 1). */
    line: integer("line").notNull(),
    data: jsonb("data").notNull(),
    zoneId: uuid("zone_id").references(() => zones.id),
    /** Codes des problèmes bloquants (ligne non importée) et avertissements. */
    issues: text("issues").array().notNull().default([]),
    duplicateMemberId: uuid("duplicate_member_id"),
    /** phone | email | identity | name_birth | file (doublon d'une ligne précédente du fichier) */
    duplicateReason: text("duplicate_reason"),
    /** create | merge | skip */
    decision: text("decision").notNull().default("create"),
    /** created | merged | skipped | failed, posé par le worker */
    result: text("result"),
    memberId: uuid("member_id"),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("member_import_rows_line_key").on(t.partyId, t.importId, t.line),
    index("member_import_rows_pending").on(t.importId, t.result),
    sameParty("member_import_rows", t.partyId, t.importId, memberImports),
    sameParty("member_import_rows", t.partyId, t.duplicateMemberId, members),
    sameParty("member_import_rows", t.partyId, t.memberId, members),
  ],
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

/**
 * Journal des points (GAM-01, GAM-09) : chaque gain ou correction est une ligne, jamais modifiée. Une même action
 * ne rapporte qu'une fois (référence unique : le parrainage, la formation, le scrutin, l'échéance).
 */
export const pointEntries = pgTable(
  "point_entries",
  {
    id: id(),
    partyId: partyId(),
    memberId: uuid("member_id").notNull(),
    /** referral | training | vote | dues | attendance | manual */
    action: text("action").notNull(),
    points: integer("points").notNull(),
    referenceId: uuid("reference_id"),
    note: text("note"),
    createdByMemberId: uuid("created_by_member_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("point_entries_once").on(t.partyId, t.memberId, t.action, t.referenceId),
    index("point_entries_member").on(t.partyId, t.memberId),
    sameParty("point_entries", t.partyId, t.memberId, members),
    sameParty("point_entries", t.partyId, t.createdByMemberId, members),
    check("point_entries_action", sql`${t.action} in ('referral', 'training', 'vote', 'dues', 'attendance', 'manual')`),
  ],
);
