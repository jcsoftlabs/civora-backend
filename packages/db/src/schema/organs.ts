// ORG-01 à ORG-08, SOC-06, SEC-05
import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, partyId, timestamps } from "./_helpers.js";

export const organs = pgTable("organs", {
  id: id(),
  partyId: partyId(),
  parentOrganId: uuid("parent_organ_id"),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // organe national, section, coordination, commission, antenne diaspora (libellé libre)
  zoneId: uuid("zone_id"),
  isSecret: boolean("is_secret").notNull().default(false),
  hideMemberList: boolean("hide_member_list").notNull().default(false),
  officeAddress: text("office_address"),
  channels: jsonb("channels"), // { whatsapp, telegram, link }
  ...timestamps,
});

export const organMembers = pgTable("organ_members", {
  id: id(),
  partyId: partyId(),
  organId: uuid("organ_id").notNull(),
  memberId: uuid("member_id").notNull(),
  ...timestamps,
});

/** Poste nommé par le parti ; porte les permissions et leur portée territoriale (ORG-04). */
export const posts = pgTable("posts", {
  id: id(),
  partyId: partyId(),
  organId: uuid("organ_id").notNull(),
  title: text("title").notNull(),
  permissions: text("permissions").array().notNull().default([]),
  scopeZoneId: uuid("scope_zone_id"),
  filledBy: text("filled_by").notNull().default("nomination"), // nomination | election (ORG-07)
  ...timestamps,
});

/** Titulaires et mandats (ORG-05). */
export const postHolders = pgTable("post_holders", {
  id: id(),
  partyId: partyId(),
  postId: uuid("post_id").notNull(),
  memberId: uuid("member_id").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  sourceElectionId: uuid("source_election_id"),
  ...timestamps,
});
