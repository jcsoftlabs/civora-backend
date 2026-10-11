import { customType, foreignKey, timestamp, unique, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
// Import circulaire volontaire : `parties` n'est lu que dans le rappel de references(), après le chargement des modules.
import { parties } from "./tenancy.js";

/** Clé primaire UUID générée côté base. */
export const id = () => uuid("id").primaryKey().defaultRandom();

/** Colonne obligatoire de toute table métier : la RLS s'appuie dessus (SOC-02, SEC-01). */
export const partyId = () =>
  uuid("party_id")
    .notNull()
    .references((): AnyPgColumn => parties.id);

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

interface PartyScoped {
  partyId: AnyPgColumn;
  id: AnyPgColumn;
}

/**
 * Unicité (party_id, id) sur une table référencée : cible obligatoire des clés étrangères `sameParty`.
 * À placer sur toute table vers laquelle une autre table pointe.
 */
export const partyKey = (table: string, t: PartyScoped) => unique(`${table}_party_id_id_key`).on(t.partyId, t.id);

/**
 * Référence vers une ligne du MÊME parti (SOC-02) : clé étrangère composite (party_id, colonne).
 * La RLS ne contrôle que le party_id de la ligne écrite ; sans cette clé, un parti pourrait pointer
 * vers un membre, un organe ou un paiement d'un autre parti. Colonne nulle : aucune vérification (MATCH SIMPLE).
 */
export const sameParty = (table: string, partyCol: AnyPgColumn, col: AnyPgColumn, target: PartyScoped) =>
  foreignKey({
    name: `${table}_${col.name}_fk`,
    columns: [partyCol, col],
    foreignColumns: [target.partyId, target.id],
  });
