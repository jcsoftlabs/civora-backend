// SOC-05 : référentiel territorial. Intégrité des données, chargement idempotent, lecture seule pour l'application.
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db, withReferenceData } from "../src/client.js";
import { loadZoneFiles, syncZones } from "../src/zones.js";

const owner = postgres(process.env.DATABASE_URL_MIGRATOR ?? "", { max: 1, onnotice: () => {} });
const zones = loadZoneFiles();

afterAll(async () => {
  await owner.end();
  await closeDb();
});

describe("données territoriales", () => {
  it("couvrent les 10 départements, 140 communes et 570 sections communales (CNIGS)", () => {
    const count = (level: string) => zones.filter((z) => z.level === level).length;
    expect(count("pays")).toBe(1);
    expect(count("departement")).toBe(10);
    expect(count("commune")).toBe(140);
    expect(count("section_communale")).toBe(570);
    expect(count("diaspora_pays")).toBeGreaterThan(15);
  });

  it("ont des codes uniques, des parents connus et des chemins cohérents", () => {
    const byCode = new Map(zones.map((z) => [z.code, z]));
    expect(byCode.size).toBe(zones.length);
    for (const z of zones) {
      expect(z.path).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/);
      if (z.parent === null) {
        expect(z.path.split(".")).toHaveLength(1);
        continue;
      }
      const parent = byCode.get(z.parent);
      expect(parent, `${z.code} : parent ${z.parent}`).toBeDefined();
      expect(z.path.startsWith(`${parent!.path}.`)).toBe(true);
      expect(z.path.split(".").length).toBe(parent!.path.split(".").length + 1);
    }
  });

  it("donnent les noms créoles des départements et des communes", () => {
    const ht = zones.filter((z) => z.level === "departement" || z.level === "commune");
    expect(ht.every((z) => z.nameHt)).toBe(true);
    expect(zones.find((z) => z.code === "HT01")).toMatchObject({ name: "Ouest", nameHt: "Lwès" });
    expect(zones.find((z) => z.code === "HT08")?.name).toBe("Grand'Anse");
  });
});

describe("chargement en base", () => {
  it("est idempotent et garde les identifiants", async () => {
    const before = await owner`select id, code from zones where code in ('HT01', 'HT0114', 'DIA-US-MIA') order by code`;
    await syncZones(owner);
    const after = await owner`select id, code from zones where code in ('HT01', 'HT0114', 'DIA-US-MIA') order by code`;
    expect(after).toEqual(before);
    const [n] = await owner`select count(*)::int as n from zones where code ~ '^(HT|DIA)'`;
    expect(n?.n).toBe(zones.length);
  });

  it("relie chaque zone à son parent", async () => {
    const [orphans] = await owner`
      select count(*)::int as n from zones z
      where z.code ~ '^(HT|DIA)' and nlevel(z.path) > 1
        and not exists (select 1 from zones p where p.id = z.parent_id and z.path <@ p.path)`;
    expect(orphans?.n).toBe(0);
  });

  it("reste en lecture seule pour l'application", async () => {
    await expect(
      db.execute(sql`insert into zones (level, code, name, path) values ('pays', 'XX', 'Faux', 'xx')`),
    ).rejects.toThrow();
    await expect(db.execute(sql`update zones set name = 'Faux' where code = 'HT01'`)).rejects.toThrow();
  });

  it("withReferenceData lit les zones, sans rien pouvoir écrire ni voir des partis", async () => {
    await withReferenceData(async (tx) => {
      const rows = await tx.execute(sql`select 1 from zones where code = 'HT0114'`);
      expect(rows.length).toBe(1);
      expect((await tx.execute(sql`select 1 from members`)).length).toBe(0);
    });
    await expect(
      withReferenceData((tx) =>
        tx.execute(sql`insert into audit_log (party_id, actor_kind, action) values (gen_random_uuid(), 'system', 'x')`),
      ),
    ).rejects.toThrow();
  });
});
