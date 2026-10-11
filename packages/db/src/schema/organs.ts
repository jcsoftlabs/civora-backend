// ORG-01 à ORG-08, SOC-06, SEC-05
import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, partyId, partyKey, sameParty, timestamps } from "./_helpers.js";
import { members } from "./people.js";
import { zones } from "./territory.js";
import { elections } from "./votes.js";

export const organs = pgTable(
  "organs",
  {
    id: id(),
    partyId: partyId(),
    parentOrganId: uuid("parent_organ_id"),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // organe national, section, coordination, commission, antenne diaspora (libellé libre)
    zoneId: uuid("zone_id").references(() => zones.id),
    isSecret: boolean("is_secret").notNull().default(false),
    hideMemberList: boolean("hide_member_list").notNull().default(false),
    officeAddress: text("office_address"),
    channels: jsonb("channels"), // { whatsapp, telegram, link }
    ...timestamps,
  },
  (t) => [partyKey("organs", t), sameParty("organs", t.partyId, t.parentOrganId, t)],
);

export const organMembers = pgTable(
  "organ_members",
  {
    id: id(),
    partyId: partyId(),
    organId: uuid("organ_id").notNull(),
    memberId: uuid("member_id").notNull(),
    ...timestamps,
  },
  (t) => [
    sameParty("organ_members", t.partyId, t.organId, organs),
    sameParty("organ_members", t.partyId, t.memberId, members),
  ],
);

/** Poste nommé par le parti ; porte les permissions et leur portée territoriale (ORG-04). */
export const posts = pgTable(
  "posts",
  {
    id: id(),
    partyId: partyId(),
    organId: uuid("organ_id").notNull(),
    title: text("title").notNull(),
    permissions: text("permissions").array().notNull().default([]),
    scopeZoneId: uuid("scope_zone_id").references(() => zones.id),
    filledBy: text("filled_by").notNull().default("nomination"), // nomination | election (ORG-07)
    ...timestamps,
  },
  (t) => [partyKey("posts", t), sameParty("posts", t.partyId, t.organId, organs)],
);

/** Titulaires et mandats (ORG-05). */
export const postHolders = pgTable(
  "post_holders",
  {
    id: id(),
    partyId: partyId(),
    postId: uuid("post_id").notNull(),
    memberId: uuid("member_id").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    sourceElectionId: uuid("source_election_id"),
    ...timestamps,
  },
  (t) => [
    sameParty("post_holders", t.partyId, t.postId, posts),
    sameParty("post_holders", t.partyId, t.memberId, members),
    sameParty("post_holders", t.partyId, t.sourceElectionId, elections),
  ],
);
