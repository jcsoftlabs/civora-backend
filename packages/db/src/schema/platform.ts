// SEC-06, SEC-11, synchronisation hors ligne, intégrations BI (BI-06, BI-07)
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, partyId } from "./_helpers.js";

/** Journal d'audit append-only : UPDATE et DELETE révoqués pour civora_app. */
export const auditLog = pgTable("audit_log", {
  id: id(),
  partyId: partyId(),
  actorUserId: uuid("actor_user_id"),
  actorKind: text("actor_kind").notNull(), // member | staff | system
  action: text("action").notNull(), // export.members | identity.read | role.change | staff.access ...
  targetType: text("target_type"),
  targetId: uuid("target_id"),
  metadata: jsonb("metadata"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
