// ENG-01 à ENG-05, PRE-01 à PRE-07, GAM-01 à GAM-09
import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { id, partyId, timestamps } from "./_helpers.js";

export const events = pgTable("events", {
  id: id(),
  partyId: partyId(),
  organId: uuid("organ_id"),
  zoneId: uuid("zone_id"),
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
});

export const eventRegistrations = pgTable("event_registrations", {
  id: id(),
  partyId: partyId(),
  eventId: uuid("event_id").notNull(),
  memberId: uuid("member_id").notNull(),
  ...timestamps,
});

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
  (t) => [unique().on(t.eventId, t.memberId)],
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

/** Journal des points, append-only (GAM-09). */
export const pointLedger = pgTable("point_ledger", {
  id: id(),
  partyId: partyId(),
  memberId: uuid("member_id").notNull(),
  points: integer("points").notNull(),
  reason: text("reason").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: uuid("source_id"),
  correctedByMemberId: uuid("corrected_by_member_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const badges = pgTable("badges", {
  id: id(),
  partyId: partyId(),
  name: jsonb("name").notNull(),
  minPoints: integer("min_points"),
  conditions: jsonb("conditions"),
  ...timestamps,
});

export const memberBadges = pgTable("member_badges", {
  id: id(),
  partyId: partyId(),
  memberId: uuid("member_id").notNull(),
  badgeId: uuid("badge_id").notNull(),
  awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const challenges = pgTable("challenges", {
  id: id(),
  partyId: partyId(),
  title: jsonb("title").notNull(),
  goal: jsonb("goal").notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const rewards = pgTable("rewards", {
  id: id(),
  partyId: partyId(),
  memberId: uuid("member_id").notNull(),
  label: text("label").notNull(),
  grantedByMemberId: uuid("granted_by_member_id").notNull(),
  ...timestamps,
});

/** Sondages (ENG-02) et pétitions (ENG-05). */
export const surveys = pgTable("surveys", {
  id: id(),
  partyId: partyId(),
  kind: text("kind").notNull(), // survey | petition | proposal
  title: jsonb("title").notNull(),
  questions: jsonb("questions").notNull(),
  audience: jsonb("audience"),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  ...timestamps,
});

export const surveyResponses = pgTable("survey_responses", {
  id: id(),
  partyId: partyId(),
  surveyId: uuid("survey_id").notNull(),
  memberId: uuid("member_id").notNull(),
  answers: jsonb("answers").notNull(),
  ...timestamps,
});
