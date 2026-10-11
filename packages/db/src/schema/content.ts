// FOR-01 à FOR-04, COM-01 à COM-06, DOC-01 à DOC-08
import { bigint, boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, partyId, timestamps } from "./_helpers.js";

export const courses = pgTable("courses", {
  id: id(),
  partyId: partyId(),
  title: jsonb("title").notNull(),
  passThresholdPercent: integer("pass_threshold_percent").notNull().default(65),
  maxAttempts: integer("max_attempts"),
  mandatoryForStatusIds: uuid("mandatory_for_status_ids").array(), // FOR-03
  ...timestamps,
});

export const lessons = pgTable("lessons", {
  id: id(),
  partyId: partyId(),
  courseId: uuid("course_id").notNull(),
  position: integer("position").notNull(),
  title: jsonb("title").notNull(),
  mediaFileId: uuid("media_file_id"),
  quiz: jsonb("quiz"),
  ...timestamps,
});

export const lessonAttempts = pgTable("lesson_attempts", {
  id: id(),
  partyId: partyId(),
  lessonId: uuid("lesson_id").notNull(),
  memberId: uuid("member_id").notNull(),
  scorePercent: integer("score_percent").notNull(),
  passed: boolean("passed").notNull(),
  ...timestamps,
});

/** Annonces, actualités, podcasts, albums (COM-01). */
export const publications = pgTable("publications", {
  id: id(),
  partyId: partyId(),
  kind: text("kind").notNull(), // announcement | news | podcast | album | editorial
  title: jsonb("title").notNull(),
  body: jsonb("body"),
  mediaFileIds: uuid("media_file_ids").array(),
  audience: jsonb("audience"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  ...timestamps,
});

/** Envois groupés push, SMS, WhatsApp, e-mail (COM-02, COM-03). */
export const outreachCampaigns = pgTable("outreach_campaigns", {
  id: id(),
  partyId: partyId(),
  channel: text("channel").notNull(), // push | sms | whatsapp | email
  audience: jsonb("audience").notNull(), // segment : zone, statut, organe, filtres
  content: jsonb("content").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentCount: integer("sent_count").notNull().default(0),
  creditsUsed: integer("credits_used").notNull().default(0),
  ...timestamps,
});

/** Segments enregistrés du back-office (constructeur de filtres). */
export const savedSegments = pgTable("saved_segments", {
  id: id(),
  partyId: partyId(),
  name: text("name").notNull(),
  filters: jsonb("filters").notNull(),
  ...timestamps,
});

export const conversations = pgTable("conversations", {
  id: id(),
  partyId: partyId(),
  kind: text("kind").notNull(), // support | organ | direct
  organId: uuid("organ_id"),
  ...timestamps,
});

export const messages = pgTable("messages", {
  id: id(),
  partyId: partyId(),
  conversationId: uuid("conversation_id").notNull(),
  authorMemberId: uuid("author_member_id"),
  body: text("body").notNull(),
  ...timestamps,
});

/** Fichiers R2, clé party/<party_id>/... (DOC-01 à DOC-08). */
export const files = pgTable("files", {
  id: id(),
  partyId: partyId(),
  organId: uuid("organ_id"),
  zoneId: uuid("zone_id"),
  r2Key: text("r2_key").notNull().unique(),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  storageClass: text("storage_class").notNull().default("standard"), // standard | infrequent
  immutable: boolean("immutable").notNull().default(false), // PV électoraux (ELE-12)
  readPermission: text("read_permission"),
  writePermission: text("write_permission"),
  version: integer("version").notNull().default(1),
  previousVersionId: uuid("previous_version_id"),
  trashedAt: timestamp("trashed_at", { withTimezone: true }),
  ...timestamps,
});
