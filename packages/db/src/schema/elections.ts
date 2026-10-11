// ELE-01 à ELE-18 : module Élections (option par cycle)
import { doublePrecision, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { id, partyId, partyKey, sameParty, timestamps } from "./_helpers.js";
import { files } from "./content.js";
import { members } from "./people.js";
import { zones } from "./territory.js";

export const electionCycles = pgTable(
  "election_cycles",
  {
    id: id(),
    partyId: partyId(),
    name: text("name").notNull(),
    pollingDay: timestamp("polling_day", { withTimezone: true }).notNull(),
    calendar: jsonb("calendar"), // ELE-18
    ...timestamps,
  },
  (t) => [partyKey("election_cycles", t)],
);

export const pollingCenters = pgTable(
  "polling_centers",
  {
    id: id(),
    partyId: partyId(),
    cycleId: uuid("cycle_id").notNull(),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zones.id),
    name: text("name").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    supervisorMemberId: uuid("supervisor_member_id"),
    ...timestamps,
  },
  (t) => [
    partyKey("polling_centers", t),
    sameParty("polling_centers", t.partyId, t.cycleId, electionCycles),
    sameParty("polling_centers", t.partyId, t.supervisorMemberId, members),
  ],
);

export const pollingStations = pgTable(
  "polling_stations",
  {
    id: id(),
    partyId: partyId(),
    centerId: uuid("center_id").notNull(),
    code: text("code").notNull(),
    registeredVoters: integer("registered_voters"),
    ...timestamps,
  },
  (t) => [
    partyKey("polling_stations", t),
    unique().on(t.partyId, t.centerId, t.code),
    sameParty("polling_stations", t.partyId, t.centerId, pollingCenters),
  ],
);

/** Mandataires : titulaire et suppléant par bureau (ELE-02 à ELE-05). */
export const observerAssignments = pgTable(
  "observer_assignments",
  {
    id: id(),
    partyId: partyId(),
    stationId: uuid("station_id").notNull(),
    memberId: uuid("member_id").notNull(),
    role: text("role").notNull(), // titulaire | suppleant
    trainingCompletedAt: timestamp("training_completed_at", { withTimezone: true }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkInLat: doublePrecision("check_in_lat"),
    checkInLng: doublePrecision("check_in_lng"),
    ...timestamps,
  },
  (t) => [
    sameParty("observer_assignments", t.partyId, t.stationId, pollingStations),
    sameParty("observer_assignments", t.partyId, t.memberId, members),
  ],
);

/** Procès-verbaux (ELE-07 à ELE-12). id généré sur le téléphone pour l'envoi différé. */
export const tallySheets = pgTable(
  "tally_sheets",
  {
    id: id(),
    partyId: partyId(),
    stationId: uuid("station_id").notNull(),
    photoFileId: uuid("photo_file_id").notNull(),
    figures: jsonb("figures").notNull(),
    enteredByMemberId: uuid("entered_by_member_id").notNull(),
    enteredAt: timestamp("entered_at", { withTimezone: true }).notNull(),
    secondEntryFigures: jsonb("second_entry_figures"),
    validatedByMemberId: uuid("validated_by_member_id"),
    consistencyErrors: jsonb("consistency_errors"),
    status: text("status").notNull().default("received"), // received | checking | validated | rejected
    ...timestamps,
  },
  (t) => [
    sameParty("tally_sheets", t.partyId, t.stationId, pollingStations),
    sameParty("tally_sheets", t.partyId, t.photoFileId, files),
    sameParty("tally_sheets", t.partyId, t.enteredByMemberId, members),
    sameParty("tally_sheets", t.partyId, t.validatedByMemberId, members),
  ],
);

export const incidents = pgTable(
  "incidents",
  {
    id: id(),
    partyId: partyId(),
    stationId: uuid("station_id"),
    category: text("category").notNull(), // fraude | violence | materiel | retard
    description: text("description"),
    photoFileId: uuid("photo_file_id"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    reportedByMemberId: uuid("reported_by_member_id").notNull(),
    handlingStatus: text("handling_status").notNull().default("open"),
    ...timestamps,
  },
  (t) => [
    sameParty("incidents", t.partyId, t.stationId, pollingStations),
    sameParty("incidents", t.partyId, t.photoFileId, files),
    sameParty("incidents", t.partyId, t.reportedByMemberId, members),
  ],
);

/** Porte-à-porte (ELE-16). */
export const canvassContacts = pgTable(
  "canvass_contacts",
  {
    id: id(),
    partyId: partyId(),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zones.id),
    assignedMemberId: uuid("assigned_member_id"),
    fullName: text("full_name"),
    phoneE164: text("phone_e164"),
    support: text("support"), // favorable | indecis | opposé
    notes: text("notes"),
    visitedAt: timestamp("visited_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [sameParty("canvass_contacts", t.partyId, t.assignedMemberId, members)],
);

/** Dossiers des candidats du parti (ELE-17). */
export const candidacyFiles = pgTable(
  "candidacy_files",
  {
    id: id(),
    partyId: partyId(),
    cycleId: uuid("cycle_id").notNull(),
    memberId: uuid("member_id").notNull(),
    office: text("office").notNull(),
    requiredDocuments: jsonb("required_documents").notNull(),
    deadline: timestamp("deadline", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    sameParty("candidacy_files", t.partyId, t.cycleId, electionCycles),
    sameParty("candidacy_files", t.partyId, t.memberId, members),
  ],
);
