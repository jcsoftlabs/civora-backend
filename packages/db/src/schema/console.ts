// SOC-10, SEC-11 : console de l'éditeur. Comptes du personnel de la plateforme (propriétaire, support),
// codes de connexion, sessions et journal des actions de la console. Ces tables ne portent pas de party_id :
// elles n'appartiennent à aucune organisation. Une politique RLS (sql/console.sql) ne les ouvre qu'aux
// transactions marquées par withConsole() ; une requête d'organisation ne les voit jamais.
import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { encrypted, id } from "./_helpers.js";

export const platformStaff = pgTable(
  "platform_staff",
  {
    id: id(),
    /** Toujours en minuscules. */
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    role: text("role").notNull(), // owner | support
    /** Secret TOTP de la double authentification, enveloppé par la clé maîtresse. */
    mfaSecret: encrypted("mfa_secret"),
    mfaConfirmedAt: timestamp("mfa_confirmed_at", { withTimezone: true }),
    mfaLastStep: integer("mfa_last_step"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("platform_staff_role", sql`${t.role} in ('owner', 'support')`)],
);

/** Code de connexion envoyé par e-mail, dix minutes, cinq essais. */
export const staffChallenges = pgTable("staff_challenges", {
  id: id(),
  staffId: uuid("staff_id")
    .notNull()
    .references(() => platformStaff.id),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Session de la console : douze heures, double authentification obligatoire avant tout accès. */
export const staffSessions = pgTable("staff_sessions", {
  id: id(),
  staffId: uuid("staff_id")
    .notNull()
    .references(() => platformStaff.id),
  tokenHash: text("token_hash").notNull().unique(),
  mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Journal des actions de la console (ajout seulement) : qui, quoi, sur quelle organisation, quand. */
export const platformAuditLog = pgTable("platform_audit_log", {
  id: id(),
  staffId: uuid("staff_id").references(() => platformStaff.id),
  action: text("action").notNull(),
  targetPartyId: uuid("target_party_id"),
  metadata: jsonb("metadata"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
