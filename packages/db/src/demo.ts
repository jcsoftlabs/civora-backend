// Jeu de démonstration (développement uniquement) : un parti fictif, « Parti Horizon », avec quatorze mois
// d'histoire : membres dans plusieurs départements et la diaspora, cotisations MonCash, NatCash et espèces,
// organes et postes, rassemblements passés et à venir, publications, une formation suivie. Sert aux captures du
// site commercial et aux démonstrations. Tirage pseudo-aléatoire fixe : chaque exécution donne le même parti.
// Aucune donnée réelle, aucune donnée de NOU. Refuse de tourner ailleurs que sur une base locale.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { PERMISSIONS } from "@civora/shared";

const url = process.env.DATABASE_URL_MIGRATOR ?? "";
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error("Jeu de démonstration refusé : base non locale.");
  process.exit(1);
}

const SLUG = "horizon";
/** Ligne insérée en masse : valeurs simples seulement. */
type Value = string | number | boolean | Date | null | string[];
type Row = Record<string, Value>;
const sql = postgres(url, { max: 1, onnotice: () => {} });

// Tirage fixe (mulberry32).
let seed = 20261011;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
const chance = (p: number) => rand() < p;
const DAY = 86_400_000;

const FIRST = {
  f: [
    "Nadège",
    "Roseline",
    "Mirlande",
    "Fabienne",
    "Wideline",
    "Guerline",
    "Marie-Ange",
    "Sabrina",
    "Nathalie",
    "Esther",
    "Judith",
    "Rose-Marie",
    "Darline",
    "Lovely",
    "Kettly",
    "Yolette",
    "Myriam",
    "Stéphanie",
    "Islande",
    "Nadine",
    "Carline",
    "Évelyne",
    "Farah",
    "Tamara",
    "Chedeline",
    "Roselaure",
    "Bethanie",
    "Naïka",
  ],
  m: [
    "Jean-Robert",
    "Wilner",
    "Ricardo",
    "Peterson",
    "Jean-Claude",
    "Frantz",
    "Wesner",
    "Marc-Arthur",
    "Daniel",
    "Kervens",
    "Junior",
    "Stanley",
    "Emmanuel",
    "Lesly",
    "Guerby",
    "Frednel",
    "Jameson",
    "Ronald",
    "Wisly",
    "Dieuseul",
    "Mackenson",
    "Jonas",
    "Vladimir",
    "Ernst",
    "Fritz",
    "Joseph",
    "Patrick",
    "Yves",
  ],
};
const LAST = [
  "Jean-Baptiste",
  "Pierre",
  "Joseph",
  "Louis",
  "Charles",
  "Saint-Fleur",
  "Désir",
  "Augustin",
  "Delva",
  "Étienne",
  "François",
  "Baptiste",
  "Célestin",
  "Noël",
  "Paul",
  "Alexis",
  "Michel",
  "Dorvil",
  "Jean-Louis",
  "Philogène",
  "Toussaint",
  "Bien-Aimé",
  "Cadet",
  "Laguerre",
  "Valcourt",
  "Fleurant",
  "Exantus",
  "Mondésir",
  "Lamour",
  "Jeudy",
  "Aristide",
  "Louissaint",
  "Petit-Frère",
  "Félix",
  "Destin",
  "Vilsaint",
  "Hyppolite",
  "Simon",
  "Florestal",
  "Moïse",
];
const TAGS = ["jeunes", "femmes", "enseignants", "étudiants", "commerçants", "bénévoles", "agriculteurs", "santé"];

/** Communes et poids : l'Ouest pèse le plus, puis l'Artibonite, le Nord, le Sud. */
const COMMUNES: Array<[string, number]> = [
  ["HT0113", 14], // Carrefour
  ["HT0121", 9], // Léogâne
  ["HT0131", 8], // Croix-des-Bouquets
  ["HT0122", 5], // Petit-Goâve
  ["HT0141", 4], // Arcahaie
  ["HT0521", 6], // Gros Morne
  ["HT0541", 5], // Dessalines
  ["HT0532", 4], // Verrettes
  ["HT0371", 5], // Plaisance
  ["HT0331", 3], // Grande-Rivière-du-Nord
  ["HT0211", 6], // Jacmel
  ["HT0731", 4], // Aquin
  ["HT0811", 4], // Jérémie
  ["HT0911", 3], // Port-de-Paix
];

async function wipe() {
  const [p] = await sql<{ id: string }[]>`select id from parties where slug = ${SLUG}`;
  if (!p) return;
  const tables = await sql<{ table_name: string }[]>`
    select c.table_name from information_schema.columns c
    join information_schema.tables t using (table_schema, table_name)
    where c.table_schema = 'public' and c.column_name = 'party_id' and t.table_type = 'BASE TABLE'`;
  // Journal d'audit en ajout seul et clés croisées : seul le propriétaire local peut vider l'ancien jeu.
  await sql`set session_replication_role = replica`;
  for (const t of tables) await sql.unsafe(`delete from "${t.table_name}" where party_id = $1`, [p.id]);
  await sql`delete from users where email like ${"%@horizon.demo"}`;
  await sql`delete from parties where id = ${p.id}`;
  await sql`set session_replication_role = origin`;
}

async function main() {
  await wipe();
  const now = new Date();
  const start = new Date(now.getTime() - 420 * DAY);

  const [party] = await sql<{ id: string }[]>`
    insert into parties (slug, name, tier, brand_color, languages, admission_mode, status, activated_at, created_at)
    values (${SLUG}, 'Parti Horizon', 'national', '#0F6E66', ${["fr", "ht"]}, 'validation', 'active', ${start}, ${start})
    returning id`;
  const P = party!.id;

  // Statuts
  const statuses = await sql<{ id: string; rank: number }[]>`
    insert into member_statuses ${sql([
      { party_id: P, label: sql.json({ fr: "Sympathisant", ht: "Senpatizan" }), rank: 10 },
      { party_id: P, label: sql.json({ fr: "Militant", ht: "Militan" }), rank: 20 },
      { party_id: P, label: sql.json({ fr: "Cadre", ht: "Kad" }), rank: 30 },
    ])} returning id, rank`;
  const statusByRank = Object.fromEntries(statuses.map((s) => [s.rank, s.id]));

  // Sections communales tirées dans les communes, et villes de la diaspora.
  const sections = new Map<string, Array<{ id: string; code: string }>>();
  for (const [code] of COMMUNES) {
    sections.set(
      code,
      await sql<{ id: string; code: string }[]>`
        select s.id, s.code from zones s join zones c on c.id = s.parent_id where c.code = ${code} order by s.code`,
    );
  }
  const diaspora = await sql<{ id: string; code: string }[]>`
    select id, code from zones where level = 'diaspora_ville'
      and (code like 'DIA-US-%' or code like 'DIA-CA-%' or code like 'DIA-FR-%') order by code`;
  const totalWeight = COMMUNES.reduce((n, [, w]) => n + w, 0);
  const homeZone = () => {
    let r = rand() * totalWeight;
    for (const [code, w] of COMMUNES) {
      r -= w;
      if (r <= 0) return pick(sections.get(code)!);
    }
    return pick(sections.get(COMMUNES[0]![0])!);
  };

  // Membres : croissance sur quatorze mois, l'adhésion s'accélère avant le congrès.
  type M = {
    id: string;
    zoneId: string;
    diaspora: boolean;
    joinedAt: Date;
    reliability: number;
    first: string;
    last: string;
  };
  const members: M[] = [];
  const rows: Row[] = [];
  const N = 432;
  for (let i = 0; i < N; i++) {
    const female = chance(0.47);
    const first = pick(female ? FIRST.f : FIRST.m);
    const last = pick(LAST);
    const isDiaspora = chance(0.13);
    const zone = isDiaspora ? pick(diaspora) : homeZone();
    // Davantage d'adhésions récentes : tirage biaisé vers la fin.
    const joinedAt = new Date(start.getTime() + Math.pow(rand(), 0.7) * (now.getTime() - start.getTime() - DAY));
    const id = randomUUID();
    const pending = i >= N - 17;
    const rank = chance(0.12) ? 30 : chance(0.55) ? 20 : 10;
    const tags = TAGS.filter(() => chance(0.16)).slice(0, 3);
    if (isDiaspora) tags.unshift("diaspora");
    rows.push({
      id,
      party_id: P,
      user_id: null,
      member_number: String(1000 + i).padStart(6, "0"),
      first_name: first,
      last_name: last,
      phone_e164: `+509${pick(["3", "4", "3", "4", "5"])}${String(Math.floor(rand() * 1e7)).padStart(7, "0")}`,
      zone_id: zone.id,
      is_diaspora: isDiaspora,
      residence_country: isDiaspora ? zone.code.slice(4, 6) : null,
      status_id: pending ? null : (statusByRank[rank] ?? null),
      category: isDiaspora ? "diaspora" : chance(0.15) ? "étudiant" : null,
      application_state: pending ? "pending" : "approved",
      application_score: pending ? Math.floor(50 + rand() * 45) : null,
      tags,
      joined_at: pending ? null : joinedAt,
      created_at: joinedAt,
      updated_at: joinedAt,
    });
    if (!pending)
      members.push({
        id,
        zoneId: zone.id,
        diaspora: isDiaspora,
        joinedAt,
        reliability: chance(0.6) ? 0.95 : chance(0.6) ? 0.7 : 0.3,
        first,
        last,
      });
  }
  // L'administratrice de la démonstration : secrétaire générale, à Carrefour.
  const adminId = randomUUID();
  const [adminUser] = await sql<{ id: string }[]>`
    insert into users (email, locale) values ('nadege.pierre-louis@horizon.demo', 'fr') returning id`;
  rows.unshift({
    id: adminId,
    party_id: P,
    user_id: adminUser!.id,
    member_number: "000001",
    first_name: "Nadège",
    last_name: "Pierre-Louis",
    phone_e164: "+50937000001",
    zone_id: sections.get("HT0113")![0]!.id,
    is_diaspora: false,
    residence_country: null,
    status_id: statusByRank[30] ?? null,
    category: null,
    application_state: "approved",
    application_score: null,
    tags: ["femmes"],
    joined_at: start,
    created_at: start,
    updated_at: start,
  });
  for (let i = 0; i < rows.length; i += 200) await sql`insert into members ${sql(rows.slice(i, i + 200))}`;
  // Personnes référentes : quelques membres parrainés par la secrétaire générale.
  await sql`update members set referent_member_id = ${adminId} where party_id = ${P} and id <> ${adminId}
    and member_number::int % 25 = 0`;

  // Organes et postes
  const organ = async (
    name: string,
    kind: string,
    zoneCode: string | null,
    parent: string | null,
    channels?: object,
  ) => {
    const [o] = await sql<{ id: string }[]>`
      insert into organs (party_id, name, kind, zone_id, parent_organ_id, channels, created_at)
      values (${P}, ${name}, ${kind}, ${zoneCode ? sql`(select id from zones where code = ${zoneCode})` : null},
        ${parent}, ${channels ? sql.json(channels as postgres.JSONValue) : null}, ${start}) returning id`;
    return o!.id;
  };
  const post = async (
    organId: string,
    title: string,
    permissions: string[],
    scope: string | null,
    holder: string | null,
  ) => {
    const [p] = await sql<{ id: string }[]>`
      insert into posts (party_id, organ_id, title, permissions, scope_zone_id)
      values (${P}, ${organId}, ${title}, ${permissions},
        ${scope ? sql`(select id from zones where code = ${scope})` : null}) returning id`;
    if (holder)
      await sql`insert into post_holders (party_id, post_id, member_id, starts_at)
        values (${P}, ${p!.id}, ${holder}, ${new Date(start.getTime() + 20 * DAY)})`;
  };
  const byPrefix = async (prefix: string) =>
    (
      await sql<{ id: string }[]>`select m.id from members m join zones z on z.id = m.zone_id
        where m.party_id = ${P} and m.application_state = 'approved' and z.code like ${prefix + "%"} order by m.member_number`
    ).map((r) => r.id);
  const wa = (code: string) => ({ whatsapp: `https://chat.whatsapp.com/demo${code}` });
  const national = await organ("Bureau national", "Bureau national", "HT", null, wa("BN"));
  await post(national, "Secrétaire générale", [...PERMISSIONS], null, adminId);
  const ouestIds = await byPrefix("HT01");
  const artIds = await byPrefix("HT05");
  const nordIds = await byPrefix("HT03");
  const diaIds = await byPrefix("DIA");
  await post(
    national,
    "Trésorier national",
    ["members.read", "payments.read", "payments.recordCash", "dues.manage"],
    null,
    ouestIds[3]!,
  );
  await post(national, "Responsable formation", ["members.read", "training.manage", "bi.read"], null, ouestIds[7]!);
  await post(
    national,
    "Responsable communication",
    ["members.read", "publications.manage", "outreach.send"],
    null,
    ouestIds[11]!,
  );
  await post(national, "Porte-parole", [], null, null);
  const coordOuest = await organ("Coordination de l'Ouest", "Coordination départementale", "HT01", national, wa("OU"));
  await post(
    coordOuest,
    "Coordonnateur départemental",
    ["members.read", "members.write", "events.manage", "bi.read"],
    "HT01",
    ouestIds[15]!,
  );
  await post(
    coordOuest,
    "Trésorière départementale",
    ["members.read", "payments.read", "payments.recordCash"],
    "HT01",
    ouestIds[19]!,
  );
  const coordArt = await organ(
    "Coordination de l'Artibonite",
    "Coordination départementale",
    "HT05",
    national,
    wa("AR"),
  );
  await post(
    coordArt,
    "Coordonnatrice départementale",
    ["members.read", "members.write", "events.manage", "bi.read"],
    "HT05",
    artIds[2]!,
  );
  await post(
    coordArt,
    "Trésorier départemental",
    ["members.read", "payments.read", "payments.recordCash"],
    "HT05",
    null,
  );
  const coordNord = await organ("Coordination du Nord", "Coordination départementale", "HT03", national, wa("NO"));
  await post(
    coordNord,
    "Coordonnateur départemental",
    ["members.read", "members.write", "events.manage", "bi.read"],
    "HT03",
    nordIds[1]!,
  );
  const carrefour = await organ("Section de Carrefour", "Section communale", "HT0113", coordOuest, wa("CA"));
  await post(carrefour, "Responsable de section", ["members.read", "events.manage"], "HT0113", ouestIds[23]!);
  await post(carrefour, "Secrétaire de section", ["members.read"], "HT0113", ouestIds[27]!);
  const femmes = await organ("Commission des femmes", "Commission", "HT", national, wa("CF"));
  await post(femmes, "Présidente", ["members.read", "events.manage"], null, ouestIds[31]!);
  const jeunes = await organ("Commission jeunesse", "Commission", "HT", national, wa("CJ"));
  await post(jeunes, "Président", ["members.read", "events.manage"], null, null);
  const mtl = await organ("Antenne de Montréal", "Antenne diaspora", "DIA-CA-MTL", national, wa("MT"));
  await post(mtl, "Responsable d'antenne", ["members.read", "events.manage"], "DIA-CA-MTL", diaIds[0] ?? null);
  // Membres des organes (effectifs visibles sur les cartes).
  const organRoster: Array<[string, string[]]> = [
    [national, ouestIds.slice(0, 14)],
    [coordOuest, ouestIds.slice(14, 60)],
    [coordArt, artIds.slice(0, 26)],
    [coordNord, nordIds.slice(0, 18)],
    [carrefour, (await byPrefix("HT0113")).slice(0, 52)],
    [femmes, ouestIds.filter((_, i) => i % 3 === 0).slice(0, 38)],
    [jeunes, ouestIds.filter((_, i) => i % 4 === 1).slice(0, 29)],
    [mtl, diaIds.slice(0, 12)],
  ];
  for (const [organId, ids] of organRoster)
    if (ids.length)
      await sql`insert into organ_members ${sql(ids.map((m) => ({ party_id: P, organ_id: organId, member_id: m })))}`;

  // Cotisations : 250 gourdes par mois ; 10 dollars par mois pour la diaspora.
  const [htg] = await sql<{ id: string }[]>`
    insert into dues_plans (party_id, name, amount, currency, periodicity, due_rule, grace_days, is_default, created_at)
    values (${P}, ${sql.json({ fr: "Cotisation mensuelle", ht: "Kotizasyon chak mwa" })}, 250, 'HTG', 'monthly', 'anniversary', 15, true, ${start})
    returning id`;
  const [usd] = await sql<{ id: string }[]>`
    insert into dues_plans (party_id, name, amount, currency, periodicity, due_rule, grace_days, created_at)
    values (${P}, ${sql.json({ fr: "Cotisation diaspora", ht: "Kotizasyon dyaspora" })}, 10, 'USD', 'monthly', 'anniversary', 15, ${start})
    returning id`;
  const [annual] = await sql<{ id: string }[]>`
    insert into dues_plans (party_id, name, amount, currency, periodicity, due_rule, grace_days, created_at)
    values (${P}, ${sql.json({ fr: "Cotisation annuelle des cadres", ht: "Kotizasyon anyèl kad yo" })}, 5000, 'HTG', 'annual', 'anniversary', 30, ${start})
    returning id`;
  void annual;

  const subs: Row[] = [];
  const obligations: Row[] = [];
  const payments: Row[] = [];
  const treasurer = ouestIds[3]!;
  const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  for (const m of members) {
    const plan = m.diaspora ? usd! : htg!;
    const amount = m.diaspora ? "10.00" : "250.00";
    const currency = m.diaspora ? "USD" : "HTG";
    subs.push({ party_id: P, member_id: m.id, plan_id: plan.id, starts_on: iso(m.joinedAt) });
    for (let d = monthStart(m.joinedAt); d <= now; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      const due = new Date(d.getTime() + 9 * DAY);
      const oid = randomUUID();
      const current = d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
      const paid = due < now && chance(current ? m.reliability * 0.55 : m.reliability);
      let paymentId: string | null = null;
      let paidAt: Date | null = null;
      if (paid) {
        paymentId = randomUUID();
        paidAt = new Date(Math.min(now.getTime() - 3600_000, due.getTime() - 8 * DAY + rand() * 14 * DAY));
        const provider = m.diaspora ? "stripe" : pick(["moncash", "moncash", "moncash", "natcash", "natcash", "cash"]);
        payments.push({
          id: paymentId,
          party_id: P,
          member_id: m.id,
          kind: "dues",
          provider,
          provider_ref: provider === "cash" ? null : `DEMO-${randomBytes(5).toString("hex").toUpperCase()}`,
          idempotency_key: `demo-${oid}`,
          amount,
          currency,
          status: "succeeded",
          recorded_by_member_id: provider === "cash" ? treasurer : null,
          obligation_ids: [oid],
          confirmed_at: paidAt,
          created_at: paidAt,
          updated_at: paidAt,
        });
      }
      obligations.push({
        id: oid,
        party_id: P,
        member_id: m.id,
        plan_id: plan.id,
        period_start: iso(d),
        due_date: iso(due),
        amount,
        paid_at: paidAt,
        payment_id: paymentId,
      });
    }
  }
  // Quelques dons, dont un de la diaspora.
  for (let i = 0; i < 26; i++) {
    const m = pick(members);
    const at = new Date(now.getTime() - rand() * 150 * DAY);
    payments.push({
      id: randomUUID(),
      party_id: P,
      member_id: m.id,
      kind: "donation",
      provider: m.diaspora ? "stripe" : pick(["moncash", "natcash"]),
      provider_ref: `DEMO-${randomBytes(5).toString("hex").toUpperCase()}`,
      idempotency_key: `demo-don-${i}`,
      amount: m.diaspora ? pick(["25.00", "50.00", "100.00"]) : pick(["500.00", "1000.00", "2500.00"]),
      currency: m.diaspora ? "USD" : "HTG",
      status: "succeeded",
      recorded_by_member_id: null,
      obligation_ids: [],
      confirmed_at: at,
      created_at: at,
      updated_at: at,
    });
  }
  // Deux paiements en attente de confirmation MonCash (réseau irrégulier).
  for (let i = 0; i < 2; i++) {
    const m = pick(members.filter((x) => !x.diaspora));
    const at = new Date(now.getTime() - (i + 1) * 3600_000);
    payments.push({
      id: randomUUID(),
      party_id: P,
      member_id: m.id,
      kind: "dues",
      provider: "moncash",
      provider_ref: null,
      idempotency_key: `demo-pending-${i}`,
      amount: "250.00",
      currency: "HTG",
      status: "pending",
      recorded_by_member_id: null,
      obligation_ids: [],
      confirmed_at: null,
      created_at: at,
      updated_at: at,
    });
  }
  await sql`insert into dues_subscriptions ${sql(subs)}`;
  for (let i = 0; i < payments.length; i += 500) await sql`insert into payments ${sql(payments.slice(i, i + 500))}`;
  for (let i = 0; i < obligations.length; i += 500)
    await sql`insert into dues_obligations ${sql(obligations.slice(i, i + 500))}`;
  // Reçus numérotés par année, dans l'ordre des encaissements ; écritures au journal.
  const settled = payments
    .filter((p) => p.status === "succeeded")
    .sort((a, b) => (a.confirmed_at as Date).getTime() - (b.confirmed_at as Date).getTime());
  const counters = new Map<number, number>();
  const receipts = settled.map((p) => {
    const y = (p.confirmed_at as Date).getUTCFullYear();
    const n = (counters.get(y) ?? 0) + 1;
    counters.set(y, n);
    return { party_id: P, payment_id: p.id, number: `${y}-${String(n).padStart(6, "0")}`, created_at: p.confirmed_at };
  });
  const zoneOf = new Map(members.map((m) => [m.id, m.zoneId]));
  const ledger = settled.map((p) => ({
    party_id: P,
    zone_id: zoneOf.get(p.member_id as string) ?? null,
    direction: "in",
    category: p.kind === "donation" ? "don" : "cotisation",
    amount: p.amount,
    currency: p.currency,
    payment_id: p.id,
    occurred_at: p.confirmed_at,
  }));
  for (let i = 0; i < receipts.length; i += 500) await sql`insert into receipts ${sql(receipts.slice(i, i + 500))}`;
  for (let i = 0; i < ledger.length; i += 500) await sql`insert into ledger_entries ${sql(ledger.slice(i, i + 500))}`;

  // Rassemblements : deux passés, quatre à venir.
  const at = (days: number, hour: number) => {
    const d = new Date(now.getTime() + days * DAY);
    // Heure d'Haïti (UTC-4 en octobre).
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour + 4, 0));
  };
  const event = async (
    kind: string,
    title: { fr: string; ht: string },
    zoneCode: string,
    startsAt: Date,
    hours: number,
    address: string,
    capacity: number | null,
    attendees: string[],
    registrations: string[],
    organId: string | null,
  ) => {
    const [e] = await sql<{ id: string }[]>`
      insert into events (party_id, organ_id, zone_id, kind, title, starts_at, ends_at, qr_secret_ref, rotating_qr,
        address, capacity, created_at)
      values (${P}, ${organId}, (select id from zones where code = ${zoneCode}), ${kind}, ${sql.json(title)},
        ${startsAt}, ${new Date(startsAt.getTime() + hours * 3600_000)}, ${`demo:${randomUUID()}`}, true,
        ${address}, ${capacity}, ${new Date(startsAt.getTime() - 30 * DAY)})
      returning id`;
    if (registrations.length)
      await sql`insert into event_registrations ${sql(
        registrations.map((m) => ({
          party_id: P,
          event_id: e!.id,
          member_id: m,
          created_at: new Date(startsAt.getTime() - rand() * 20 * DAY),
        })),
      )}`;
    if (attendees.length)
      await sql`insert into attendances ${sql(
        attendees.map((m) => ({
          id: randomUUID(),
          party_id: P,
          event_id: e!.id,
          member_id: m,
          method: chance(0.8) ? "member_scan" : "staff_scan",
          scanned_by_member_id: null,
          scanned_at: new Date(startsAt.getTime() + rand() * 90 * 60_000),
          synced_at: new Date(startsAt.getTime() + 3 * 3600_000),
        })),
      )}`;
  };
  const all = members.map((m) => m.id);
  const sample = (list: string[], p: number) => list.filter(() => chance(p));
  const pastRally = sample(ouestIds, 0.62);
  await event(
    "rassemblement",
    { fr: "Rassemblement de Carrefour", ht: "Rasanbleman Kafou" },
    "HT0113",
    at(-58, 10),
    4,
    "Place de Carrefour",
    600,
    sample(pastRally, 0.81),
    pastRally,
    carrefour,
  );
  const pastMeeting = sample(artIds, 0.7);
  await event(
    "reunion",
    { fr: "Assemblée de la coordination de l'Artibonite", ht: "Asanble kowòdinasyon Latibonit" },
    "HT0541",
    at(-23, 14),
    3,
    "Salle paroissiale, Dessalines",
    150,
    sample(pastMeeting, 0.77),
    pastMeeting,
    coordArt,
  );
  await event(
    "rassemblement",
    { fr: "Grand rassemblement de Léogâne", ht: "Gwo rasanbleman Leyogàn" },
    "HT0121",
    at(12, 10),
    5,
    "Parc de Léogâne",
    800,
    [],
    sample(ouestIds, 0.55),
    coordOuest,
  );
  await event(
    "formation",
    { fr: "Formation des nouveaux militants", ht: "Fòmasyon nouvo militan yo" },
    "HT0113",
    at(5, 9),
    3,
    "Local du parti, Carrefour",
    60,
    [],
    sample(ouestIds, 0.12).slice(0, 52),
    carrefour,
  );
  await event(
    "reunion",
    { fr: "Réunion de l'antenne de Montréal", ht: "Reyinyon antèn Monreyal" },
    "DIA-CA-MTL",
    at(19, 19),
    2,
    "Centre communautaire, Montréal",
    120,
    [],
    sample(diaIds, 0.6),
    mtl,
  );
  await event(
    "congres",
    { fr: "Congrès national 2026", ht: "Kongrè nasyonal 2026" },
    "HT0113",
    at(41, 9),
    9,
    "Centre de convention, Port-au-Prince",
    1500,
    [],
    sample(all, 0.42),
    national,
  );

  // Publications
  const publication = async (
    kind: string,
    title: { fr: string; ht: string },
    body: { fr: string; ht: string },
    days: number,
  ) => {
    await sql`insert into publications (party_id, kind, title, body, audience, published_at, created_at)
      values (${P}, ${kind}, ${sql.json(title)}, ${sql.json(body)}, null, ${new Date(now.getTime() - days * DAY)},
        ${new Date(now.getTime() - days * DAY - 3600_000)})`;
  };
  await publication(
    "announcement",
    { fr: "Le congrès national aura lieu le mois prochain", ht: "Kongrè nasyonal la ap fèt mwa pwochen" },
    {
      fr: "Les inscriptions sont ouvertes dans l'application et auprès de chaque section.",
      ht: "Enskripsyon yo louvri nan aplikasyon an ak nan chak seksyon.",
    },
    2,
  );
  await publication(
    "news",
    { fr: "Bilan du rassemblement de Carrefour", ht: "Bilan rasanbleman Kafou a" },
    {
      fr: "Plus de quatre cents militants présents, quarante nouvelles adhésions sur place.",
      ht: "Plis pase katsan militan te la, karant nouvo manm sou plas.",
    },
    56,
  );
  await publication(
    "editorial",
    { fr: "Pourquoi nous cotisons", ht: "Poukisa nou kotize" },
    {
      fr: "Chaque gourde versée finance la formation des militants et la présence du parti dans les sections.",
      ht: "Chak goud nou bay finanse fòmasyon militan yo ak prezans pati a nan seksyon yo.",
    },
    12,
  );
  await sql`insert into publications (party_id, kind, title, body, created_at)
    values (${P}, 'news', ${sql.json({ fr: "Programme de la commission jeunesse", ht: "Pwogram komisyon jèn yo" })}, null, ${now})`;
  // Notifications envoyées
  await sql`insert into outreach_campaigns ${sql([
    {
      party_id: P,
      channel: "push",
      audience: sql.json({ zoneCodes: ["HT01"] }),
      content: sql.json({
        title: { fr: "Rassemblement de Léogâne", ht: "Rasanbleman Leyogàn" },
        body: { fr: "Inscrivez-vous : places limitées.", ht: "Enskri : pa gen anpil plas." },
      }),
      status: "sent",
      sent_count: 214,
      sent_at: new Date(now.getTime() - 3 * DAY),
      created_by_member_id: adminId,
    },
    {
      party_id: P,
      channel: "push",
      audience: sql.json({}),
      content: sql.json({
        title: { fr: "Cotisation d'octobre", ht: "Kotizasyon oktòb" },
        body: { fr: "Réglez en un geste avec MonCash ou NatCash.", ht: "Peye fasil ak MonCash oswa NatCash." },
      }),
      status: "sent",
      sent_count: 388,
      sent_at: new Date(now.getTime() - 9 * DAY),
      created_by_member_id: adminId,
    },
  ])}`;

  // Formation : trois modules, un quiz, une centaine de membres en cours ou certifiés.
  const [course] = await sql<{ id: string }[]>`
    insert into courses (party_id, title, description, pass_threshold_percent, max_attempts, mandatory_for_status_ids, published_at, created_at)
    values (${P}, ${sql.json({ fr: "Les bases du militant", ht: "Baz militan an" })},
      ${sql.json({ fr: "L'histoire du parti, son organisation et le rôle de chaque militant.", ht: "Istwa pati a, òganizasyon l ak wòl chak militan." })},
      80, 3, ${[statusByRank[20]!]}, ${new Date(now.getTime() - 120 * DAY)}, ${new Date(now.getTime() - 130 * DAY)})
    returning id`;
  const C = course!.id;
  const QUIZ = [
    {
      id: "q1",
      question: { fr: "Combien de départements compte Haïti ?", ht: "Konbyen depatman Ayiti genyen ?" },
      choices: [
        { id: "a", text: { fr: "9" } },
        { id: "b", text: { fr: "10" } },
        { id: "c", text: { fr: "11" } },
      ],
      correct: ["b"],
    },
    {
      id: "q2",
      question: { fr: "Qui vote au congrès ?", ht: "Kiyès ki vote nan kongrè a ?" },
      choices: [
        { id: "a", text: { fr: "Les délégués" } },
        { id: "b", text: { fr: "Les membres à jour" } },
        { id: "c", text: { fr: "Personne" } },
      ],
      correct: ["a", "b"],
    },
  ];
  const mod = async (position: number, title: { fr: string; ht: string }, quiz: unknown) =>
    (
      await sql<{ id: string }[]>`insert into course_modules (party_id, course_id, position, title, quiz)
      values (${P}, ${C}, ${position}, ${sql.json(title)}, ${quiz ? sql.json(quiz as postgres.JSONValue) : null}) returning id`
    )[0]!.id;
  const chapter = async (
    moduleId: string,
    position: number,
    kind: string,
    title: { fr: string; ht: string },
    body: string | null,
    embed: string | null,
  ) =>
    (
      await sql<
        { id: string }[]
      >`insert into lessons (party_id, course_id, module_id, position, kind, title, body, embed_url)
      values (${P}, ${C}, ${moduleId}, ${position}, ${kind}, ${sql.json(title)}, ${body ? sql.json({ fr: body }) : null}, ${embed})
      returning id`
    )[0]!.id;
  const m1 = await mod(1, { fr: "Notre histoire", ht: "Istwa nou" }, null);
  const m2 = await mod(2, { fr: "L'organisation du parti", ht: "Òganizasyon pati a" }, QUIZ);
  const m3 = await mod(3, { fr: "Militer dans sa section", ht: "Milite nan seksyon w" }, null);
  const chapters = [
    await chapter(
      m1,
      1,
      "text",
      { fr: "Les origines du parti", ht: "Orijin pati a" },
      "Le parti est né d'une rencontre entre militants de quartier.",
      null,
    ),
    await chapter(
      m1,
      2,
      "youtube",
      { fr: "Le mot de la secrétaire générale", ht: "Mesaj sekretè jeneral la" },
      null,
      "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ",
    ),
    await chapter(
      m2,
      1,
      "text",
      { fr: "Du bureau national à la section communale", ht: "Soti nan biwo nasyonal rive nan seksyon kominal" },
      "Chaque organe a ses postes et sa zone.",
      null,
    ),
    await chapter(
      m2,
      2,
      "text",
      { fr: "Les statuts en dix points", ht: "Estati yo an dis pwen" },
      "Les statuts fixent les droits et les devoirs des membres.",
      null,
    ),
    await chapter(
      m3,
      1,
      "text",
      { fr: "Accueillir un nouveau membre", ht: "Akeyi yon nouvo manm" },
      "Le responsable de section valide l'adhésion et présente le parti.",
      null,
    ),
  ];
  const learners = sample(all, 0.31);
  const attempts: Row[] = [];
  const completions: Row[] = [];
  let certificate = 0;
  for (const m of learners) {
    const depth = rand();
    const when = new Date(now.getTime() - rand() * 100 * DAY);
    const seen = depth > 0.75 ? 5 : depth > 0.45 ? 4 : depth > 0.2 ? 2 : 1;
    for (const ch of chapters.slice(0, seen))
      attempts.push({
        party_id: P,
        lesson_id: ch,
        module_id: null,
        member_id: m,
        score_percent: 100,
        passed: true,
        created_at: when,
      });
    if (seen >= 4) {
      const passed = seen === 5 || chance(0.5);
      attempts.push({
        party_id: P,
        lesson_id: null,
        module_id: m2,
        member_id: m,
        score_percent: passed ? 100 : 50,
        passed,
        created_at: when,
      });
    }
    if (seen === 5) {
      certificate++;
      completions.push({
        party_id: P,
        course_id: C,
        member_id: m,
        completed_at: when,
        certificate_number: `${when.getUTCFullYear()}-${String(certificate).padStart(6, "0")}`,
      });
    }
  }
  if (attempts.length) await sql`insert into lesson_attempts ${sql(attempts)}`;
  if (completions.length) await sql`insert into course_completions ${sql(completions)}`;
  await sql`insert into certificate_templates (party_id, footer, show_logo, signatories)
    values (${P}, ${sql.json({ fr: "Délivré par le bureau national du Parti Horizon.", ht: "Biwo nasyonal Pati Orizon an bay li." })}, true,
      ${sql.json([
        {
          name: "Nadège Pierre-Louis",
          role: { fr: "Secrétaire générale", ht: "Sekretè jeneral" },
          signatureFileId: null,
        },
        {
          name: "Wilner Augustin",
          role: { fr: "Responsable formation", ht: "Responsab fòmasyon" },
          signatureFileId: null,
        },
      ])})`;

  // Session de démonstration (sans double authentification : base locale seulement).
  const token = randomBytes(32).toString("base64url");
  await sql`insert into sessions (party_id, user_id, member_id, token_hash, expires_at)
    values (${P}, ${adminUser!.id}, ${adminId}, ${createHash("sha256").update(token, "utf8").digest("hex")},
      ${new Date(now.getTime() + 7 * DAY)})`;
  const out = resolve(process.cwd(), "../../.demo-session.json");
  writeFileSync(out, JSON.stringify({ slug: SLUG, token }, null, 2));
  console.log(
    `Parti Horizon : ${rows.length} membres, ${payments.length} paiements, ${obligations.length} échéances, ` +
      `${learners.length} apprenants, ${certificate} certificats. Session écrite dans .demo-session.json.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
