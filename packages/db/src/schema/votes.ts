// VOT-01 à VOT-10. Secret du vote : ballots ne contient jamais l'identifiant du votant (VOT-05, BI-09).
import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { id, partyId, partyKey, sameParty, timestamps } from "./_helpers.js";
import { files } from "./content.js";
import { posts } from "./organs.js";
import { members } from "./people.js";
import { zones } from "./territory.js";

export const votingMethodEnum = pgEnum("voting_method", ["simple_majority", "two_rounds", "list", "yes_no"]);
export const electionStateEnum = pgEnum("election_state", ["draft", "roll_frozen", "open", "closed", "published"]);

export const elections = pgTable(
  "elections",
  {
    id: id(),
    partyId: partyId(),
    title: jsonb("title").notNull(),
    description: jsonb("description"),
    /** post : poste à pourvoir ; question : oui ou non (VOT-01). */
    kind: text("kind").notNull().default("post"),
    /** Zone du scrutin : le responsable doit avoir votes.manage sur cette zone ; sans zone, tout le parti. */
    zoneId: uuid("zone_id").references(() => zones.id),
    postId: uuid("post_id"), // poste à pourvoir (VOT-10)
    /** Sièges à pourvoir : plusieurs en mode liste, un sinon. */
    seats: integer("seats").notNull().default(1),
    /** Tour en cours : 2 après un premier tour sans majorité absolue (deux tours). */
    round: integer("round").notNull().default(1),
    /** Candidatures des membres jusqu'à cette date (VOT-04) ; sans date, le responsable les saisit. */
    candidaciesCloseAt: timestamp("candidacies_close_at", { withTimezone: true }),
    /** Contestation de la liste figée jusqu'à cette date (VOT-03). */
    contestationsCloseAt: timestamp("contestations_close_at", { withTimezone: true }),
    /** Conditions d'éligibilité des candidats : mêmes règles que le corps électoral. */
    eligibility: jsonb("eligibility"),
    allowBlank: boolean("allow_blank").notNull().default(true),
    certifiedAt: timestamp("certified_at", { withTimezone: true }),
    certifiedByMemberId: uuid("certified_by_member_id"),
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
  (t) => [
    partyKey("elections", t),
    sameParty("elections", t.partyId, t.postId, posts),
    sameParty("elections", t.partyId, t.certifiedByMemberId, members),
    check("elections_kind", sql`${t.kind} in ('post', 'question')`),
    check("elections_seats", sql`${t.seats} between 1 and 50`),
  ],
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
    /** pending (candidature déposée), accepted, rejected, withdrawn. */
    status: text("status").notNull().default("accepted"),
    decisionReason: text("decision_reason"),
    /** Qualifié pour le second tour. */
    runoff: boolean("runoff").notNull().default(false),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    sameParty("candidates", t.partyId, t.electionId, elections),
    sameParty("candidates", t.partyId, t.memberId, members),
  ],
);

/**
 * Contestation de la liste électorale figée (VOT-03) : un membre signale une omission (lui ou un autre) ou une
 * inscription indue ; un responsable accepte (la liste est corrigée) ou rejette, avec un motif.
 */
export const rollContests = pgTable(
  "roll_contests",
  {
    id: id(),
    partyId: partyId(),
    electionId: uuid("election_id").notNull(),
    memberId: uuid("member_id").notNull(),
    concernedMemberId: uuid("concerned_member_id").notNull(),
    kind: text("kind").notNull(), // missing | ineligible
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"), // pending | accepted | rejected
    decidedByMemberId: uuid("decided_by_member_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    ...timestamps,
  },
  (t) => [
    sameParty("roll_contests", t.partyId, t.electionId, elections),
    sameParty("roll_contests", t.partyId, t.memberId, members),
    sameParty("roll_contests", t.partyId, t.concernedMemberId, members),
    sameParty("roll_contests", t.partyId, t.decidedByMemberId, members),
    check("roll_contests_kind", sql`${t.kind} in ('missing', 'ineligible')`),
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
    /** Inscrits au moment du dépouillement, quorum atteint, gagnants ou second tour (VOT-07, VOT-09). */
    registered: integer("registered").notNull().default(0),
    valid: boolean("valid").notNull().default(true),
    outcome: jsonb("outcome"),
    minutesFileId: uuid("minutes_file_id"),
    ...timestamps,
  },
  (t) => [
    unique("election_results_round").on(t.partyId, t.electionId, t.round),
    sameParty("election_results", t.partyId, t.electionId, elections),
    sameParty("election_results", t.partyId, t.minutesFileId, files),
  ],
);
