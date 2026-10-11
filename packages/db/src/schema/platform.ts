// SEC-06, SEC-11, synchronisation hors ligne, intégrations BI (BI-06, BI-07)
import { bigint, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { id, partyId } from "./_helpers.js";

/**
 * Journal d'audit inaltérable (SEC-06). Ajout seulement : un déclencheur refuse toute modification et toute
 * suppression, même au propriétaire. Chaîne d'empreintes par parti (sql/audit.sql) : chaque ligne porte un numéro
 * d'ordre et l'empreinte SHA-256 de son contenu et de la ligne précédente ; une ligne modifiée, retirée ou
 * intercalée casse la chaîne et se voit à la vérification. seq, prev_hash et hash sont calculés par la base.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    partyId: partyId(),
    seq: bigint("seq", { mode: "number" }).notNull().default(0),
    actorUserId: uuid("actor_user_id"),
    actorKind: text("actor_kind").notNull(), // member | staff | system
    action: text("action").notNull(), // export.members | identity.read | role.change | staff.access ...
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    prevHash: text("prev_hash").notNull().default(""),
    hash: text("hash").notNull().default(""),
  },
  (t) => [unique("audit_log_party_seq").on(t.partyId, t.seq)],
);

/** Opérations reçues des téléphones : idempotence de la synchronisation. */
export const syncOperations = pgTable("sync_operations", {
  id: id(), // UUID client
  partyId: partyId(),
  deviceId: text("device_id").notNull(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  clientCreatedAt: timestamp("client_created_at", { withTimezone: true }).notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  result: jsonb("result"),
});

/** Clés d'API de données et comptes de service BI. */
export const dataApiKeys = pgTable("data_api_keys", {
  id: id(),
  partyId: partyId(),
  label: text("label").notNull(),
  keyHash: text("key_hash").notNull(),
  scopes: text("scopes").array().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Demandes d'accès du personnel aux données d'un parti (SEC-11). */
export const staffAccessRequests = pgTable("staff_access_requests", {
  id: id(),
  partyId: partyId(),
  staffUserId: uuid("staff_user_id").notNull(),
  reason: text("reason").notNull(),
  approvedByPartyUserId: uuid("approved_by_party_user_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
