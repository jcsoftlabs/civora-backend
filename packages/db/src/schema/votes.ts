// VOT-01 à VOT-10. Secret du vote : ballots ne contient jamais l'identifiant du votant (VOT-05, BI-09).
import { integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { id, partyId, partyKey, sameParty, timestamps } from "./_helpers.js";
import { files } from "./content.js";
import { posts } from "./organs.js";
import { members } from "./people.js";

export const votingMethodEnum = pgEnum("voting_method", ["simple_majority", "two_rounds", "list", "yes_no"]);
export const electionStateEnum = pgEnum("election_state", ["draft", "roll_frozen", "open", "closed", "published"]);

export const elections = pgTable(
  "elections",
  {
    id: id(),
    partyId: partyId(),
    title: jsonb("title").notNull(),
    postId: uuid("post_id"), // poste à pourvoir (VOT-10)
    method: votingMethodEnum("method").notNull().default("simple_majority"),
    state: electionStateEnum("state").notNull().default("draft"),
    /** Règles du corps électoral : zone, organe, statut, ancienneté, cotisation à jour (VOT-02). */
    rules: jsonb("rules").notNull(),
    rollFrozenAt: timestamp("roll_frozen_at", { withTimezone: true }),
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    quorumPercent: integer("quorum_percent"),
    validityThresholdPercent: integer("validity_threshold_percent"),
    inPersonQr: text("in_person_qr"), // VOT-08
    ...timestamps,
  },
  (t) => [partyKey("elections", t), sameParty("elections", t.partyId, t.postId, posts)],
);

/** Liste électorale figée (VOT-03). */
export const electoralRolls = pgTable(
  "electoral_rolls",
  {
    id: id(),
    partyId: partyId(),
    electionId: uuid("election_id").notNull(),
    memberId: uuid("member_id").notNull(),
    contested: text("contested"),
  },
  (t) => [
    unique().on(t.partyId, t.electionId, t.memberId),
    sameParty("electoral_rolls", t.partyId, t.electionId, elections),
    sameParty("electoral_rolls", t.partyId, t.memberId, members),
  ],
);

export const candidates = pgTable(
  "candidates",
  {
    id: id(),
    partyId: partyId(),
    electionId: uuid("election_id").notNull(),
    memberId: uuid("member_id"),
    label: jsonb("label").notNull(), // candidat, liste ou option
    statement: jsonb("statement"),
    eligibilityChecked: timestamp("eligibility_checked", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    sameParty("candidates", t.partyId, t.electionId, elections),
    sameParty("candidates", t.partyId, t.memberId, members),
  ],
);

/** Preuve de participation : qui a voté, jamais pour qui. */
export const ballotReceipts = pgTable(
  "ballot_receipts",
  {
    id: id(),
    partyId: partyId(),
    electionId: uuid("election_id").notNull(),
    memberId: uuid("member_id").notNull(),
    round: integer("round").notNull().default(1),
    castAt: timestamp("cast_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.partyId, t.electionId, t.memberId, t.round),
    sameParty("ballot_receipts", t.partyId, t.electionId, elections),
    sameParty("ballot_receipts", t.partyId, t.memberId, members),
  ],
);

/** Bulletin anonyme : aucun memberId, aucun horodatage précis lié au reçu. */
export const ballots = pgTable(
  "ballots",
  {
    id: id(),
    partyId: partyId(),
    electionId: uuid("election_id").notNull(),
    round: integer("round").notNull().default(1),
    choice: jsonb("choice").notNull(),
    publicHash: text("public_hash").notNull(), // journal vérifiable (VOT-09)
  },
  (t) => [sameParty("ballots", t.partyId, t.electionId, elections)],
);

export const electionResults = pgTable(
  "election_results",
  {
    id: id(),
    partyId: partyId(),
    electionId: uuid("election_id").notNull(),
    round: integer("round").notNull().default(1),
    tally: jsonb("tally").notNull(),
    turnout: integer("turnout").notNull(),
    minutesFileId: uuid("minutes_file_id"),
    ...timestamps,
  },
  (t) => [
    sameParty("election_results", t.partyId, t.electionId, elections),
    sameParty("election_results", t.partyId, t.minutesFileId, files),
  ],
);
