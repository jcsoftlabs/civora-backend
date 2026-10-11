import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const client = postgres(process.env.DATABASE_URL ?? "", { max: 20 });
export const db = drizzle(client, { schema });

export type Tx = Parameters<Parameters<PostgresJsDatabase<typeof schema>["transaction"]>[0]>[0];

/**
 * Seule porte d'entrée vers les données d'un parti.
 * Ouvre une transaction et fixe app.party_id pour la durée de la transaction uniquement (SET LOCAL),
 * ce qui reste sûr derrière un pooler. La RLS fait le reste.
 */
export async function withParty<T>(partyId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(partyId)) throw new Error("party_id invalide");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.party_id', ${partyId}, true)`);
    return fn(tx);
  });
}
