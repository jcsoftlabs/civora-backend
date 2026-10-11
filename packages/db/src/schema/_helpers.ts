import { customType, timestamp, uuid } from "drizzle-orm/pg-core";

/** Clé primaire UUID générée côté base. */
export const id = () => uuid("id").primaryKey().defaultRandom();

/** Colonne obligatoire de toute table métier : la RLS s'appuie dessus (SOC-02, SEC-01). */
export const partyId = () => uuid("party_id").notNull();

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Chemin hiérarchique des zones (extension ltree). */
export const ltree = customType<{ data: string }>({ dataType: () => "ltree" });

/** Champ chiffré (AES-256-GCM, clé du parti). Ne jamais lire sans passer par le service crypto. */
export const encrypted = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/** Texte saisi par le parti en plusieurs langues : { fr, ht, en, es }. */
export type I18nText = Partial<Record<"fr" | "ht" | "en" | "es", string>>;
