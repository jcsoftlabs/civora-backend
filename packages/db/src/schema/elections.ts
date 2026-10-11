// ELE-01 à ELE-18 : module Élections (option par cycle)
import { doublePrecision, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, partyId, timestamps } from "./_helpers.js";

export const electionCycles = pgTable("election_cycles", {
  id: id(),
  partyId: partyId(),
  name: text("name").notNull(),
  pollingDay: timestamp("polling_day", { withTimezone: true }).notNull(),
  calendar: jsonb("calendar"), // ELE-18
  ...timestamps,
});

export const pollingCenters = pgTable("polling_centers", {
  id: id(),
  partyId: partyId(),
  cycleId: uuid("cycle_id").notNull(),
  zoneId: uuid("zone_id").notNull(),
  name: text("name").notNull(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  supervisorMemberId: uuid("supervisor_member_id"),
  ...timestamps,
});

export const pollingStations = pgTable("polling_stations", {
  id: id(),
  partyId: partyId(),
  centerId: uuid("center_id").notNull(),
  code: text("code").notNull(),
  registeredVoters: integer("registered_voters"),
  ...timestamps,
});

/** Mandataires : titulaire et suppléant par bureau (ELE-02 à ELE-05). */
export const observerAssignments = pgTable("observer_assignments", {
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
});

/** Procès-verbaux (ELE-07 à ELE-12). id généré sur le téléphone pour l'envoi différé. */
export const tallySheets = pgTable("tally_sheets", {
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
});

export const incidents = pgTable("incidents", {
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
});

/** Porte-à-porte (ELE-16). */
export const canvassContacts = pgTable("canvass_contacts", {
  id: id(),
  partyId: partyId(),
  zoneId: uuid("zone_id").notNull(),
  assignedMemberId: uuid("assigned_member_id"),
  fullName: text("full_name"),
  phoneE164: text("phone_e164"),
  support: text("support"), // favorable | indecis | opposé
  notes: text("notes"),
  visitedAt: timestamp("visited_at", { withTimezone: true }),
  ...timestamps,
});

/** Dossiers des candidats du parti (ELE-17). */
export const candidacyFiles = pgTable("candidacy_files", {
  id: id(),
  partyId: partyId(),
  cycleId: uuid("cycle_id").notNull(),
  memberId: uuid("member_id").notNull(),
  office: text("office").notNull(),
  requiredDocuments: jsonb("required_documents").notNull(),
  deadline: timestamp("deadline", { withTimezone: true }),
  ...timestamps,
});
