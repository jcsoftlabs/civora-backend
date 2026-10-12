// SEC-04, SEC-09 : connexion par code à usage unique, sessions révocables, double authentification des administrateurs.
import { check, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { encrypted, id, partyId, sameParty, timestamps } from "./_helpers.js";
import { members, users } from "./people.js";

/**
 * Codes de connexion. Seule l'empreinte du code est stockée ; tentatives comptées et durée de vie courte.
 * La connexion se fait toujours dans un parti (application ou site du parti) : la table est isolée par la RLS.
 */
export const otpChallenges = pgTable("otp_challenges", {
  id: id(),
  partyId: partyId(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  channel: text("channel").notNull(), // email | sms
  purpose: text("purpose").notNull().default("login"), // login | signup : un code ne sert qu'à son usage
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Sessions en base : révocables à tout moment (téléphone perdu, départ d'un responsable).
 * Seule l'empreinte SHA-256 du jeton est stockée. La politique session_lookup (rls.sql) permet de retrouver
 * une session par l'empreinte de son jeton, avant de connaître le parti.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    partyId: partyId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    memberId: uuid("member_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** Administrateur (poste avec permissions) : la session reste limitée tant que la 2FA n'est pas validée. */
    mfaRequiredAt: timestamp("mfa_required_at", { withTimezone: true }),
    mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }),
    /**
     * full : back-office, droits des postes occupés. member : application mobile, espace membre seulement, sans
     * aucun droit de gestion ; la session dure jusqu'à la déconnexion (ou la révocation depuis le web).
     */
    scope: text("scope").notNull().default("full"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    sameParty("sessions", t.partyId, t.memberId, members),
    check("sessions_scope", sql`${t.scope} in ('full', 'member')`),
  ],
);

/** Double authentification par application (TOTP) : secret chiffré avec la clé du parti (SEC-04). */
export const memberMfa = pgTable(
  "member_mfa",
  {
    id: id(),
    partyId: partyId(),
    memberId: uuid("member_id").notNull(),
    secretEncrypted: encrypted("secret_encrypted").notNull(),
    keyVersion: integer("key_version").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    /** Dernier pas de temps accepté : un code ne sert qu'une fois. */
    lastUsedStep: integer("last_used_step"),
    ...timestamps,
  },
  (t) => [unique().on(t.partyId, t.memberId), sameParty("member_mfa", t.partyId, t.memberId, members)],
);
