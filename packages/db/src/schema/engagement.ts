// ENG-01 à ENG-05, PRE-01 à PRE-07, GAM-01 à GAM-09
import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { id, partyId, partyKey, sameParty, timestamps } from "./_helpers.js";
import { organs } from "./organs.js";
import { members } from "./people.js";
import { zones } from "./territory.js";

export const events = pgTable(
  "events",
  {
    id: id(),
    partyId: partyId(),
    organId: uuid("organ_id"),
    zoneId: uuid("zone_id").references(() => zones.id),
    kind: text("kind").notNull(), // rassemblement | reunion | congres | formation
    title: jsonb("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    geofenceMeters: integer("geofence_meters"), // PRE-03
    qrSecretRef: text("qr_secret_ref").notNull(), // secret HMAC pour le QR tournant (PRE-02)
    rotatingQr: boolean("rotating_qr").notNull().default(false),
    pointsOverride: integer("points_override"), // GAM-02
    quorum: integer("quorum"), // ENG-04
    ...timestamps,
  },
  (t) => [partyKey("events", t), sameParty("events", t.partyId, t.organId, organs)],
);

export const eventRegistrations = pgTable(
  "event_registrations",
  {
    id: id(),
    partyId: partyId(),
    eventId: uuid("event_id").notNull(),
    memberId: uuid("member_id").notNull(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.partyId, t.eventId, t.memberId),
    sameParty("event_registrations", t.partyId, t.eventId, events),
    sameParty("event_registrations", t.partyId, t.memberId, members),
  ],
);

export const attendances = pgTable(
  "attendances",
  {
    id: id(), // UUID généré sur le téléphone : idempotence hors ligne (PRE-04)
    partyId: partyId(),
    eventId: uuid("event_id").notNull(),
    memberId: uuid("member_id").notNull(),
    method: text("method").notNull(), // member_scan | staff_scan (PRE-05)
    scannedByMemberId: uuid("scanned_by_member_id"),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull(), // horodatage d'origine
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
  },
  (t) => [
    unique().on(t.partyId, t.eventId, t.memberId),
    sameParty("attendances", t.partyId, t.eventId, events),
    sameParty("attendances", t.partyId, t.memberId, members),
    sameParty("attendances", t.partyId, t.scannedByMemberId, members),
  ],
);

/** Barème configurable (GAM-01). */
export const pointRules = pgTable("point_rules", {
  id: id(),
  partyId: partyId(),
  action: text("action").notNull(), // referral_validated | attendance | dues_on_time | training_passed | vote_cast | survey_answered
  points: integer("points").notNull(),
  dailyCap: integer("daily_cap"),
  monthlyCap: integer("monthly_cap"),
  streakBonus: jsonb("streak_bonus"), // GAM-03
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** Journal des points, append-only (GAM-09). source_id est polymorphe (selon source_type) : pas de clé étrangère. */
export const pointLedger = pgTable(
  "point_ledger",
  {
    id: id(),
    partyId: partyId(),
    memberId: uuid("member_id").notNull(),
    points: integer("points").notNull(),
    reason: text("reason").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id"),
    correctedByMemberId: uuid("corrected_by_member_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    sameParty("point_ledger", t.partyId, t.memberId, members),
    sameParty("point_ledger", t.partyId, t.correctedByMemberId, members),
  ],
);

export const badges = pgTable(
  "badges",
  {
    id: id(),
    partyId: partyId(),
    name: jsonb("name").notNull(),
    minPoints: integer("min_points"),
    conditions: jsonb("conditions"),
    ...timestamps,
  },
  (t) => [partyKey("badges", t)],
);

export const memberBadges = pgTable(
  "member_badges",
  {
    id: id(),
    partyId: partyId(),
    memberId: uuid("member_id").notNull(),
    badgeId: uuid("badge_id").notNull(),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.partyId, t.memberId, t.badgeId),
    sameParty("member_badges", t.partyId, t.memberId, members),
    sameParty("member_badges", t.partyId, t.badgeId, badges),
  ],
);

export const challenges = pgTable("challenges", {
  id: id(),
  partyId: partyId(),
  title: jsonb("title").notNull(),
  goal: jsonb("goal").notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const rewards = pgTable(
  "rewards",
  {
    id: id(),
    partyId: partyId(),
    memberId: uuid("member_id").notNull(),
    label: text("label").notNull(),
    grantedByMemberId: uuid("granted_by_member_id").notNull(),
    ...timestamps,
  },
  (t) => [
    sameParty("rewards", t.partyId, t.memberId, members),
    sameParty("rewards", t.partyId, t.grantedByMemberId, members),
  ],
);

/** Sondages (ENG-02) et pétitions (ENG-05). */
export const surveys = pgTable(
  "surveys",
  {
    id: id(),
    partyId: partyId(),
    kind: text("kind").notNull(), // survey | petition | proposal
    title: jsonb("title").notNull(),
    questions: jsonb("questions").notNull(),
    audience: jsonb("audience"),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [partyKey("surveys", t)],
);

export const surveyResponses = pgTable(
  "survey_responses",
  {
    id: id(),
    partyId: partyId(),
    surveyId: uuid("survey_id").notNull(),
    memberId: uuid("member_id").notNull(),
    answers: jsonb("answers").notNull(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.partyId, t.surveyId, t.memberId),
    sameParty("survey_responses", t.partyId, t.surveyId, surveys),
    sameParty("survey_responses", t.partyId, t.memberId, members),
  ],
);
