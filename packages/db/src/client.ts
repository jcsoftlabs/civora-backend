import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

/**
 * Rôle civora_app, soumis à RLS. La connexion s'ouvre à la première requête.
 * Derrière PgBouncer en mode transaction (production), les requêtes préparées nommées sont désactivées :
 * deux transactions successives peuvent arriver sur deux connexions serveur différentes.
 * SET LOCAL reste sûr dans ce mode, puisqu'il ne vit que le temps de la transaction.
 */
const behindPgBouncer = process.env.DATABASE_PGBOUNCER === "true";

/** SEC-03 : TLS vers la base dès qu'elle est jointe par le réseau public (DATABASE_SSL=require). */
const ssl = process.env.DATABASE_SSL === "require" ? ("require" as const) : false;

const client = postgres(process.env.DATABASE_URL ?? "", {
  max: behindPgBouncer ? 10 : 20,
  prepare: !behindPgBouncer,
  ssl,
  onnotice: () => {},
});
export const db = drizzle(client, { schema });

export type Tx = Parameters<Parameters<PostgresJsDatabase<typeof schema>["transaction"]>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Seule porte d'entrée vers les données d'un parti.
 * Ouvre une transaction et fixe app.party_id pour la durée de la transaction uniquement (SET LOCAL),
 * ce qui reste sûr derrière un pooler. La RLS fait le reste.
 */
export async function withParty<T>(partyId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(partyId)) throw new Error("party_id invalide");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.party_id', ${partyId}, true)`);
    return fn(tx);
  });
}

/** Ferme le pool (arrêt du processus, fin des tests). */
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}

/**
 * Garde-fou de démarrage : l'application refuse de tourner avec un rôle qui contourne la RLS
 * (super-utilisateur « postgres » de l'hébergeur, ou rôle BYPASSRLS). Sinon l'isolation entre partis disparaît.
 */
export async function assertAppRole(): Promise<void> {
  const rows = await db.execute<{ role: string; bypass: boolean }>(
    sql`select current_user as role, (rolsuper or rolbypassrls) as bypass from pg_roles where rolname = current_user`,
  );
  const r = rows[0];
  if (!r || r.bypass) {
    throw new Error(`Le rôle « ${r?.role ?? "?"} » contourne la RLS : DATABASE_URL doit utiliser civora_app.`);
  }
}

/**
 * Recherche d'authentification, hors contexte de parti (rls.sql : session_lookup, party_public_lookup).
 * N'ouvre qu'une ligne précise : la session dont le jeton a cette empreinte, ou le parti de ce slug.
 * À n'utiliser que dans le code d'authentification et de résolution du site ; ensuite, withParty().
 */
export async function withAuthLookup<T>(
  lookup: { sessionTokenHash: string } | { partySlug: string },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    if ("sessionTokenHash" in lookup) {
      if (!/^[0-9a-f]{64}$/.test(lookup.sessionTokenHash)) throw new Error("empreinte de session invalide");
      await tx.execute(sql`select set_config('app.session_token_hash', ${lookup.sessionTokenHash}, true)`);
    } else {
      if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(lookup.partySlug)) throw new Error("slug invalide");
      await tx.execute(sql`select set_config('app.party_slug', ${lookup.partySlug}, true)`);
    }
    return fn(tx);
  });
}

/**
 * Lecture du référentiel partagé (zones), hors contexte de parti, en transaction en lecture seule.
 * Les tables métier restent invisibles ici (RLS sans app.party_id) ; aucune écriture possible.
 */
export async function withReferenceData<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    return fn(tx);
  });
}
