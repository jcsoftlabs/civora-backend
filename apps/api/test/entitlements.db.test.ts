// SOC-07, intégration : les droits sont lus en base ; modifier le palier en base suffit.
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@civora/db";
import { fetchEntitlements } from "../src/lib/entitlements.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const A = randomUUID();
const B = randomUUID();

beforeAll(async () => {
  for (const id of [A, B])
    await owner`insert into parties (id, slug, name) values (${id}, ${"test-" + id}, 'Parti test')`;
  await owner`update parties set tier = 'national' where id = ${B}`;
});

afterAll(async () => {
  await owner`delete from subscriptions where party_id in (${A}, ${B})`;
  await owner`delete from parties where id in (${A}, ${B})`;
  await owner.end();
  await closeDb();
});

describe("fetchEntitlements", () => {
  it("lit le palier du parti, et seulement le sien", async () => {
    expect(await fetchEntitlements(A)).toMatchObject({ tier: "essentiel", suspended: false, extraStoragePacks: 0 });
    expect(await fetchEntitlements(B)).toMatchObject({ tier: "national" });
  });

  it("reflète un changement de palier fait en base", async () => {
    await owner`update parties set tier = 'mouvement' where id = ${A}`;
    expect((await fetchEntitlements(A))?.tier).toBe("mouvement");
  });

  it("lit les options et la suspension du dernier abonnement", async () => {
    await owner`insert into subscriptions (party_id, tier, status, extra_storage_packs, bi_connector_option, created_at)
                values (${A}, 'mouvement', 'active', 0, false, now() - interval '1 day')`;
    await owner`insert into subscriptions (party_id, tier, status, extra_storage_packs, bi_connector_option)
                values (${A}, 'mouvement', 'suspended', 2, true)`;
    expect(await fetchEntitlements(A)).toMatchObject({
      suspended: true,
      extraStoragePacks: 2,
      biConnectorOption: true,
    });
  });

  it("renvoie null pour un parti inconnu", async () => {
    expect(await fetchEntitlements(randomUUID())).toBeNull();
  });
});
