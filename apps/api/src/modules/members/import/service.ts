// ADH-07 à ADH-09 : import du fichier de membres d'une organisation.
// 1. Démarrage : un fichier déposé (Excel, CSV) ou une feuille Google Sheets ; colonnes reconnues.
// 2. Aperçu : chaque ligne est mise en forme, sa zone retrouvée (ou à corriger), ses doublons cherchés dans le
//    fichier et dans la base (téléphone, e-mail, pièce d'identité par empreinte, nom et date de naissance). Les
//    lignes sont figées dans member_import_rows ; la pièce d'identité y est scellée avec la clé du parti.
// 3. Décisions : fusionner ou rejeter chaque doublon (rejet par défaut).
// 4. Exécution par le worker, par lots, chaque ligne une seule fois (reprise sans doublon) ; le fichier, qui
//    contient des pièces d'identité en clair, est supprimé du stockage à la fin.
// 5. Invitations : par e-mail (worker), ou liens WhatsApp que le responsable envoie depuis son téléphone.
import type { FastifyRequest } from "fastify";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  files,
  memberIdentities,
  memberImportRows,
  memberImports,
  members,
  memberStatuses,
  parties,
  users,
  withParty,
  zones,
  type Tx,
} from "@civora/db";
import { quotaLimit } from "@civora/shared";
import { audit } from "../../../lib/audit.js";
import { deriveKey, hmacHex, open, seal } from "../../../lib/crypto.js";
import type { EmailSender } from "../../../lib/messaging/email.js";
import { INVITE_MESSAGES, type MessageLocale } from "../../../lib/messaging/templates.js";
import type { PartyKeys } from "../../../lib/party-keys.js";
import type { ObjectStorage } from "../../../lib/storage/types.js";
import { ApiError } from "../../../plugins/errors.js";
import { authorize } from "../../../plugins/tenant.js";
import type { DuesService } from "../../dues/service.js";
import { onApproved } from "../../engagement/points.js";
import { normalizeIdentity, type IdentityKind, type IdentityService } from "../identity.js";
import { nextMemberNumber } from "../service.js";
import { IMPORT_FIELDS, plain, suggestMapping, type ColumnMapping } from "./fields.js";
import { cleanName, normalizeDate, normalizeEmail, normalizePhone, splitFullName, splitTags } from "./normalize.js";
import { fetchSheet, readTable, type Table } from "./parse.js";
import { ZoneIndex, zoneKey, zoneLabel, type ZoneRow } from "./zone-match.js";

type Req = FastifyRequest;
const PERM = "members.import" as const;
const MEMBER_LEVELS = new Set(["section_communale", "diaspora_pays", "diaspora_ville"]);
/** Problèmes qui empêchent d'importer la ligne. */
export const BLOCKING = new Set(["name_missing", "zone_unknown", "zone_outside_scope"]);
const CHUNK = 200;
const STALE_MS = 10 * 60_000;

export const importStart = z.union([
  z.object({ fileId: z.string().uuid() }),
  z.object({ sheetUrl: z.string().url().max(500) }),
]);

export const importSettings = z.object({
  mapping: z.record(z.enum(IMPORT_FIELDS), z.number().int().min(0).max(300)),
  /** Valeur inconnue (clé de zoneKey) → code de la zone choisie par le responsable. */
  zoneFixes: z.record(z.string().max(500), z.string().max(40)).default({}),
  defaultStatusId: z.string().uuid().nullable().default(null),
});
export type ImportSettings = z.infer<typeof importSettings>;

export const rowsQuery = z.object({
  kind: z.enum(["all", "errors", "duplicates", "warnings"]).default("all"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export const decideBody = z.object({
  decision: z.enum(["merge", "skip", "create"]),
  lines: z.array(z.number().int().positive()).max(20_000).optional(),
});

/** Données d'une ligne figée. La pièce d'identité n'y est jamais en clair. */
interface RowData {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  joinedAt: string | null;
  statusId: string | null;
  tags: string[];
  identity: { kind: IdentityKind; sealed: string; v: number } | null;
  zoneLabel: string;
  zoneKey: string;
}

const sealAad = (partyId: string, importId: string, line: number, kind: string, v: number) =>
  Buffer.from(`import|${partyId}|${importId}|${line}|${kind}|v${v}`);

const actor = (req: Req) => ({
  partyId: req.partyId,
  actorUserId: req.auth?.userId ?? null,
  actorKind: "member" as const,
  ip: req.clientIp,
});

export class MemberImportService {
  constructor(
    private readonly deps: {
      storage: ObjectStorage;
      keys: PartyKeys;
      identity: IdentityService;
      dues: DuesService;
      email: EmailSender;
      partyOrigin: string;
      fetcher?: typeof fetch;
    },
  ) {}

  private guard(req: Req) {
    if (!req.grants.some((g) => g.permission === PERM)) throw new ApiError(403, "forbidden");
  }

  private async load(tx: Tx, req: Req, id: string) {
    const [imp] = await tx.select().from(memberImports).where(eq(memberImports.id, id));
    // Un responsable ne voit que ses imports ; un poste national les voit tous.
    if (!imp || (imp.createdByMemberId !== req.memberId && !authorize(req, PERM))) throw new ApiError(404, "not_found");
    return imp;
  }

  /** Tableau du fichier ou de la feuille, relu à chaque étape (rien du contenu n'est gardé en base avant l'aperçu). */
  private async table(tx: Tx, imp: { fileId: string | null; sheetUrl: string | null }): Promise<Table> {
    if (imp.sheetUrl) return readTable(await fetchSheet(imp.sheetUrl, this.deps.fetcher), "text/csv", "feuille.csv");
    const [f] = await tx
      .select({ key: files.r2Key, mimeType: files.mimeType, name: files.name })
      .from(files)
      .where(
        and(
          eq(files.id, imp.fileId!),
          eq(files.purpose, "member_import"),
          eq(files.uploadStatus, "ready"),
          isNull(files.trashedAt),
        ),
      );
    if (!f) throw new ApiError(400, "file_not_ready");
    const obj = await this.deps.storage.read(f.key);
    if (!obj) throw new ApiError(400, "file_not_ready");
    return readTable(obj.body, f.mimeType, f.name);
  }

  private view(t: Table) {
    return { headers: t.headers, sample: t.rows.slice(0, 5).map((r) => r.cells), rows: t.rows.length };
  }

  /** Étape 1 : fichier ou feuille ; correspondance des colonnes proposée. */
  async start(req: Req, input: z.infer<typeof importStart>) {
    this.guard(req);
    return withParty(req.partyId, async (tx) => {
      const source =
        "sheetUrl" in input ? { fileId: null, sheetUrl: input.sheetUrl } : { fileId: input.fileId, sheetUrl: null };
      if (source.fileId) {
        const [f] = await tx
          .select({ by: files.uploadedByMemberId })
          .from(files)
          .where(and(eq(files.id, source.fileId), eq(files.purpose, "member_import")));
        if (!f || f.by !== req.memberId) throw new ApiError(404, "not_found");
      }
      const t = await this.table(tx, source);
      const [imp] = await tx
        .insert(memberImports)
        .values({
          partyId: req.partyId,
          ...source,
          source: source.sheetUrl ? "sheet" : "file",
          state: "mapping",
          columnMapping: { mapping: suggestMapping(t.headers), zoneFixes: {}, defaultStatusId: null },
          report: { headers: t.headers, rows: t.rows.length },
          createdByMemberId: req.memberId,
        })
        .returning({ id: memberImports.id });
      return { id: imp!.id };
    });
  }

  async list(req: Req) {
    this.guard(req);
    return withParty(req.partyId, async (tx) => {
      const rows = await tx
        .select({
          id: memberImports.id,
          state: memberImports.state,
          source: memberImports.source,
          report: memberImports.report,
          createdAt: memberImports.createdAt,
          by: memberImports.createdByMemberId,
          name: files.name,
        })
        .from(memberImports)
        .leftJoin(files, and(eq(files.partyId, memberImports.partyId), eq(files.id, memberImports.fileId)))
        .orderBy(desc(memberImports.createdAt))
        .limit(30);
      return rows
        .filter((r) => r.by === req.memberId || authorize(req, PERM))
        .map(({ by: _by, report, ...r }) => ({
          ...r,
          summary: (report as { summary?: unknown } | null)?.summary ?? null,
        }));
    });
  }

  /** État de l'import ; avant l'exécution, en-têtes et premières lignes pour l'étape des colonnes. */
  async get(req: Req, id: string) {
    this.guard(req);
    return withParty(req.partyId, async (tx) => {
      const imp = await this.load(tx, req, id);
      const settings = imp.columnMapping as ImportSettings;
      const base = {
        id: imp.id,
        state: imp.state,
        source: imp.source,
        settings,
        report: imp.report as Record<string, unknown> | null,
        inviteRequestedAt: imp.inviteRequestedAt,
      };
      if (imp.state === "queued" || imp.state === "running") {
        const [p] = await tx
          .select({
            total: sql<number>`count(*)::int`,
            done: sql<number>`count(${memberImportRows.result})::int`,
          })
          .from(memberImportRows)
          .where(eq(memberImportRows.importId, id));
        return { ...base, table: null, progress: p ?? { total: 0, done: 0 } };
      }
      if (imp.state !== "mapping" && imp.state !== "preview") return { ...base, table: null };
      return { ...base, table: this.view(await this.table(tx, imp)) };
    });
  }

  /** Étape 2 : aperçu. Lignes mises en forme et figées, doublons cherchés, synthèse sans aucune pièce d'identité. */
  async analyze(req: Req, id: string, input: ImportSettings) {
    this.guard(req);
    const settings = importSettings.parse(input);
    const quota = req.partyEntitlements ? quotaLimit(req.partyEntitlements, "members") : null;
    return withParty(req.partyId, async (tx) => {
      const imp = await this.load(tx, req, id);
      if (imp.state !== "mapping" && imp.state !== "preview") throw new ApiError(409, "import_already_started");
      const t = await this.table(tx, imp);
      const m = settings.mapping as ColumnMapping;
      const cell = (cells: string[], f: keyof ColumnMapping) => (m[f] === undefined ? "" : (cells[m[f]!] ?? ""));
      if (m.firstName === undefined && m.lastName === undefined && m.fullName === undefined)
        throw new ApiError(400, "import_name_column_required");

      const zoneRows: ZoneRow[] = await tx
        .select({
          id: zones.id,
          code: zones.code,
          level: zones.level,
          name: zones.name,
          nameHt: zones.nameHt,
          parentId: zones.parentId,
          path: zones.path,
        })
        .from(zones);
      const index = new ZoneIndex(zoneRows);
      const statuses = await tx.select({ id: memberStatuses.id, label: memberStatuses.label }).from(memberStatuses);
      const statusByLabel = new Map<string, string>();
      for (const s of statuses)
        for (const v of Object.values((s.label as Record<string, string>) ?? {}))
          if (v) statusByLabel.set(plain(v), s.id);
      if (settings.defaultStatusId && !statuses.some((s) => s.id === settings.defaultStatusId))
        throw new ApiError(400, "status_not_found");
      const key = await this.deps.keys.active(tx, req.partyId);
      const sealKey = deriveKey(key.dek, "import-enc");
      const today = new Date().toISOString().slice(0, 10);

      type Built = { line: number; data: RowData; zone: ZoneRow | null; issues: string[]; nin: string | null };
      const built: Built[] = [];
      const unknown = new Map<string, { label: string; count: number; example: number }>();
      for (const r of t.rows) {
        const issues: string[] = [];
        let firstName = cleanName(cell(r.cells, "firstName"));
        let lastName = cleanName(cell(r.cells, "lastName"));
        if ((!firstName || !lastName) && cell(r.cells, "fullName")) {
          const split = splitFullName(cell(r.cells, "fullName"));
          if (split) ({ firstName, lastName } = split);
        }
        if (!firstName || !lastName) issues.push("name_missing");
        const rawPhone = cell(r.cells, "phone");
        const phone = rawPhone ? normalizePhone(rawPhone) : null;
        if (rawPhone && !phone) issues.push("phone_invalid");
        const rawEmail = cell(r.cells, "email");
        const email = rawEmail ? normalizeEmail(rawEmail) : null;
        if (rawEmail && !email) issues.push("email_invalid");
        const rawBirth = cell(r.cells, "birthDate");
        const birthDate = rawBirth ? normalizeDate(rawBirth, { min: "1900-01-01", max: today }) : null;
        if (rawBirth && !birthDate) issues.push("birth_date_invalid");
        const rawJoined = cell(r.cells, "joinedAt");
        const joinedAt = rawJoined ? normalizeDate(rawJoined, { min: "1950-01-01", max: today }) : null;
        if (rawJoined && !joinedAt) issues.push("joined_at_invalid");
        const rawStatus = cell(r.cells, "status");
        let statusId = rawStatus ? (statusByLabel.get(plain(rawStatus)) ?? null) : null;
        if (rawStatus && !statusId) issues.push("status_unknown");
        statusId ??= settings.defaultStatusId;

        // Pièce d'identité : NIN, sinon NIF. Scellée tout de suite ; la forme canonique ne sert qu'aux doublons.
        let identity: RowData["identity"] = null;
        let nin: string | null = null;
        for (const kind of ["nin", "nif"] as const) {
          const raw = cell(r.cells, kind);
          if (!raw || identity) continue;
          try {
            nin = `${kind}:${normalizeIdentity(kind, raw)}`;
            identity = {
              kind,
              sealed: seal(
                sealKey,
                Buffer.from(normalizeIdentity(kind, raw)),
                sealAad(req.partyId, id, r.line, kind, key.version),
              ).toString("base64"),
              v: key.version,
            };
          } catch {
            issues.push("identity_invalid");
          }
        }

        const q = {
          commune: cell(r.cells, "commune"),
          section: cell(r.cells, "section"),
          city: cell(r.cells, "city"),
          country: cell(r.cells, "country"),
        };
        const k = zoneKey(q);
        const fix = settings.zoneFixes[k] ? index.get(settings.zoneFixes[k]!) : undefined;
        let zone = fix && MEMBER_LEVELS.has(fix.level) ? fix : index.match(q);
        if (!zone) {
          issues.push("zone_unknown");
          const u = unknown.get(k) ?? { label: zoneLabel(q), count: 0, example: r.line };
          u.count++;
          unknown.set(k, u);
        } else if (!authorize(req, PERM, zone.path)) {
          issues.push("zone_outside_scope");
          zone = null;
        }
        built.push({
          line: r.line,
          nin,
          zone,
          issues,
          data: {
            firstName,
            lastName,
            phone,
            email,
            birthDate,
            joinedAt,
            statusId,
            tags: cell(r.cells, "tags") ? splitTags(cell(r.cells, "tags")) : [],
            identity,
            zoneLabel: zoneLabel(q),
            zoneKey: k,
          },
        });
      }

      // ADH-08 : doublons dans le fichier (la première ligne l'emporte), puis dans la base.
      const dup = new Map<number, { reason: string; memberId: string | null }>();
      const seen = new Map<string, number>();
      for (const b of built) {
        const keys = [
          b.data.phone && `phone:${b.data.phone}`,
          b.data.email && `email:${b.data.email}`,
          b.nin && `identity:${b.nin}`,
          b.data.birthDate &&
            b.data.firstName &&
            `name:${plain(b.data.firstName + " " + b.data.lastName)}:${b.data.birthDate}`,
        ].filter((x): x is string => !!x);
        const hit = keys.find((x) => seen.has(x));
        if (hit) dup.set(b.line, { reason: "file", memberId: null });
        else for (const x of keys) seen.set(x, b.line);
      }
      const base = await this.baseDuplicates(
        tx,
        req.partyId,
        built.filter((b) => !dup.has(b.line)),
      );
      for (const [line, d] of base) dup.set(line, d);

      await tx.delete(memberImportRows).where(eq(memberImportRows.importId, id));
      for (let i = 0; i < built.length; i += 500) {
        await tx.insert(memberImportRows).values(
          built.slice(i, i + 500).map((b) => {
            const d = dup.get(b.line);
            const blocked = b.issues.some((x) => BLOCKING.has(x));
            return {
              partyId: req.partyId,
              importId: id,
              line: b.line,
              data: b.data,
              zoneId: b.zone?.id ?? null,
              issues: b.issues,
              duplicateMemberId: d?.memberId ?? null,
              duplicateReason: d?.reason ?? null,
              // Rejet par défaut des doublons ; une ligne bloquée n'est jamais importée.
              decision: blocked || d ? "skip" : "create",
            };
          }),
        );
      }

      const errors: Record<string, number> = {};
      const warnings: Record<string, number> = {};
      for (const b of built)
        for (const x of b.issues)
          (BLOCKING.has(x) ? errors : warnings)[x] = ((BLOCKING.has(x) ? errors : warnings)[x] ?? 0) + 1;
      const blocked = built.filter((b) => b.issues.some((x) => BLOCKING.has(x))).length;
      const valid = built.filter((b) => !b.issues.some((x) => BLOCKING.has(x)) && !dup.has(b.line)).length;
      const [{ n: current } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(members)
        .where(and(eq(members.applicationState, "approved"), isNull(members.deletedAt)));
      const summary = {
        rows: built.length,
        valid,
        blocked,
        duplicates: dup.size,
        duplicatesInFile: [...dup.values()].filter((d) => d.reason === "file").length,
        errors,
        warnings,
        unknownZones: [...unknown.entries()]
          .map(([k, u]) => ({ key: k, ...u }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 200),
        quota: quota === null ? null : { limit: quota, current, after: current + valid },
      };
      await tx
        .update(memberImports)
        .set({
          columnMapping: settings,
          state: "preview",
          report: { headers: t.headers, rows: t.rows.length, summary },
          updatedAt: new Date(),
        })
        .where(eq(memberImports.id, id));
      return summary;
    });
  }

  /** Membres déjà dans la base : téléphone, e-mail, pièce d'identité (empreinte), nom et date de naissance. */
  private async baseDuplicates(
    tx: Tx,
    partyId: string,
    rows: { line: number; data: RowData; nin: string | null }[],
  ): Promise<Map<number, { reason: string; memberId: string }>> {
    const out = new Map<number, { reason: string; memberId: string }>();
    const put = (line: number, reason: string, memberId: string | undefined) => {
      if (memberId && !out.has(line)) out.set(line, { reason, memberId });
    };
    const alive = isNull(members.deletedAt);
    const chunks = <T>(list: T[]) =>
      Array.from({ length: Math.ceil(list.length / 1000) }, (_, i) => list.slice(i * 1000, i * 1000 + 1000));

    const phones = [...new Set(rows.map((r) => r.data.phone).filter((p): p is string => !!p))];
    const byPhone = new Map<string, string>();
    for (const c of chunks(phones))
      for (const m of await tx
        .select({ id: members.id, phone: members.phoneE164 })
        .from(members)
        .where(and(inArray(members.phoneE164, c), alive)))
        byPhone.set(m.phone!, m.id);

    const emails = [...new Set(rows.map((r) => r.data.email).filter((e): e is string => !!e))];
    const byEmail = new Map<string, string>();
    for (const c of chunks(emails))
      for (const m of await tx
        .select({ id: members.id, email: users.email })
        .from(members)
        .innerJoin(users, eq(users.id, members.userId))
        .where(and(inArray(users.email, c), alive)))
        byEmail.set(m.email!, m.id);

    // Empreintes des pièces avec chaque version de la clé du parti, sans rien déchiffrer.
    const byHmac = new Map<string, string>();
    const withId = rows.filter((r) => r.nin);
    const hmacOf = new Map<number, string[]>();
    if (withId.length) {
      for (const v of await this.deps.keys.versions(tx, partyId)) {
        const k = deriveKey((await this.deps.keys.byVersion(tx, partyId, v)).dek, "identity-hmac");
        for (const r of withId) hmacOf.set(r.line, [...(hmacOf.get(r.line) ?? []), hmacHex(k, r.nin!)]);
      }
      const all = [...new Set([...hmacOf.values()].flat())];
      for (const c of chunks(all))
        for (const m of await tx
          .select({ id: memberIdentities.memberId, h: memberIdentities.valueHmac })
          .from(memberIdentities)
          .where(inArray(memberIdentities.valueHmac, c)))
          byHmac.set(m.h, m.id);
    }

    const births = [...new Set(rows.map((r) => r.data.birthDate).filter((d): d is string => !!d))];
    const byName = new Map<string, string>();
    for (const c of chunks(births))
      for (const m of await tx
        .select({ id: members.id, f: members.firstName, l: members.lastName, b: members.birthDate })
        .from(members)
        .where(and(inArray(members.birthDate, c), alive)))
        byName.set(`${plain(`${m.f} ${m.l}`)}:${m.b}`, m.id);

    for (const r of rows) {
      if (r.data.phone) put(r.line, "phone", byPhone.get(r.data.phone));
      if (r.data.email) put(r.line, "email", byEmail.get(r.data.email));
      for (const h of hmacOf.get(r.line) ?? []) put(r.line, "identity", byHmac.get(h));
      if (r.data.birthDate)
        put(r.line, "name_birth", byName.get(`${plain(`${r.data.firstName} ${r.data.lastName}`)}:${r.data.birthDate}`));
    }
    return out;
  }

  /** Lignes de l'aperçu ou du résultat, 50 par page. Jamais la pièce d'identité. */
  async rows(req: Req, id: string, q: z.infer<typeof rowsQuery>) {
    this.guard(req);
    return withParty(req.partyId, async (tx) => {
      await this.load(tx, req, id);
      const blocking = sql`${memberImportRows.issues} && ${sql.raw(`array[${[...BLOCKING].map((b) => `'${b}'`).join(",")}]::text[]`)}`;
      const where = and(
        eq(memberImportRows.importId, id),
        q.kind === "errors"
          ? or(blocking, eq(memberImportRows.result, "failed"))
          : q.kind === "duplicates"
            ? isNotNull(memberImportRows.duplicateReason)
            : q.kind === "warnings"
              ? sql`cardinality(${memberImportRows.issues}) > 0 and not (${blocking})`
              : undefined,
      );
      const rows = await tx
        .select({
          line: memberImportRows.line,
          data: memberImportRows.data,
          zoneName: zones.name,
          issues: memberImportRows.issues,
          duplicateReason: memberImportRows.duplicateReason,
          duplicateId: memberImportRows.duplicateMemberId,
          dupFirst: members.firstName,
          dupLast: members.lastName,
          dupNumber: members.memberNumber,
          decision: memberImportRows.decision,
          result: memberImportRows.result,
        })
        .from(memberImportRows)
        .leftJoin(zones, eq(zones.id, memberImportRows.zoneId))
        .leftJoin(
          members,
          and(eq(members.partyId, memberImportRows.partyId), eq(members.id, memberImportRows.duplicateMemberId)),
        )
        .where(where)
        .orderBy(asc(memberImportRows.line))
        .limit(50)
        .offset((q.page - 1) * 50);
      const [{ n } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(memberImportRows)
        .where(where);
      return {
        total: n,
        rows: rows.map((r) => {
          const d = r.data as RowData;
          return {
            line: r.line,
            name: `${d.firstName} ${d.lastName}`.trim(),
            phone: d.phone,
            email: d.email,
            hasIdentity: !!d.identity,
            zone: r.zoneName ?? d.zoneLabel,
            issues: r.issues,
            duplicate: r.duplicateReason
              ? {
                  reason: r.duplicateReason,
                  member: r.duplicateId
                    ? { id: r.duplicateId, name: `${r.dupFirst} ${r.dupLast}`, number: r.dupNumber }
                    : null,
                }
              : null,
            decision: r.decision,
            result: r.result,
          };
        }),
      };
    });
  }

  /**
   * Étape 3 : décision sur des doublons (toutes les lignes en doublon sans `lines`). Fusion seulement vers un membre
   * de la base ; « create » seulement pour un doublon du fichier (homonymes). Une ligne bloquée reste rejetée.
   */
  async decide(req: Req, id: string, body: z.infer<typeof decideBody>) {
    this.guard(req);
    return withParty(req.partyId, async (tx) => {
      const imp = await this.load(tx, req, id);
      if (imp.state !== "preview") throw new ApiError(409, "import_already_started");
      const target =
        body.decision === "merge"
          ? isNotNull(memberImportRows.duplicateMemberId)
          : body.decision === "create"
            ? eq(memberImportRows.duplicateReason, "file")
            : isNotNull(memberImportRows.duplicateReason);
      const notBlocked = sql`not (${memberImportRows.issues} && ${sql.raw(`array[${[...BLOCKING].map((b) => `'${b}'`).join(",")}]::text[]`)})`;
      const updated = await tx
        .update(memberImportRows)
        .set({ decision: body.decision, updatedAt: new Date() })
        .where(
          and(
            eq(memberImportRows.importId, id),
            target,
            notBlocked,
            body.lines ? inArray(memberImportRows.line, body.lines) : undefined,
          ),
        )
        .returning({ line: memberImportRows.line });
      return { updated: updated.length };
    });
  }

  /** Étape 4 : lancement. Le worker exécute ; l'aperçu ne peut plus changer. */
  async run(req: Req, id: string) {
    this.guard(req);
    await withParty(req.partyId, async (tx) => {
      const imp = await this.load(tx, req, id);
      if (imp.state !== "preview") throw new ApiError(409, "import_already_started");
      const [{ n } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(memberImportRows)
        .where(
          and(
            eq(memberImportRows.importId, id),
            or(eq(memberImportRows.decision, "create"), eq(memberImportRows.decision, "merge")),
          ),
        );
      if (!n) throw new ApiError(400, "import_nothing_to_do");
      await tx.update(memberImports).set({ state: "queued", updatedAt: new Date() }).where(eq(memberImports.id, id));
      await audit(tx, {
        ...actor(req),
        action: "members.import.start",
        targetType: "member_import",
        targetId: id,
        metadata: { rows: n },
      });
    });
  }

  /**
   * Worker : imports en attente ou interrompus du parti, par lots de 200 lignes, chacun dans sa transaction.
   * Une ligne traitée a son résultat : elle n'est jamais rejouée.
   */
  async process(partyId: string): Promise<{ rows: number; imports: number }> {
    const done = { rows: 0, imports: 0 };
    const pick = () =>
      withParty(partyId, async (tx) => {
        const [imp] = await tx
          .select({ id: memberImports.id, by: memberImports.createdByMemberId, fileId: memberImports.fileId })
          .from(memberImports)
          .where(
            or(
              eq(memberImports.state, "queued"),
              and(eq(memberImports.state, "running"), lt(memberImports.updatedAt, new Date(Date.now() - STALE_MS))),
            ),
          )
          .orderBy(asc(memberImports.createdAt))
          .limit(1)
          .for("update", { skipLocked: true });
        if (imp)
          await tx
            .update(memberImports)
            .set({ state: "running", updatedAt: new Date() })
            .where(eq(memberImports.id, imp.id));
        return imp ?? null;
      });
    for (let imp = await pick(); imp; imp = await pick()) {
      for (;;) {
        const n = await withParty(partyId, (tx) => this.chunk(tx, partyId, imp.id));
        done.rows += n;
        if (n < CHUNK) break;
      }
      await this.finish(partyId, imp.id, imp.fileId);
      done.imports++;
    }
    return done;
  }

  private async chunk(tx: Tx, partyId: string, importId: string): Promise<number> {
    const rows = await tx
      .select()
      .from(memberImportRows)
      .where(and(eq(memberImportRows.importId, importId), isNull(memberImportRows.result)))
      .orderBy(asc(memberImportRows.line))
      .limit(CHUNK)
      .for("update", { skipLocked: true });
    for (const row of rows) {
      let result: "created" | "merged" | "skipped" | "failed" = "skipped";
      let memberId: string | null = null;
      const issues = [...row.issues];
      if (row.decision !== "skip" && !row.issues.some((x) => BLOCKING.has(x))) {
        try {
          const out = await tx.transaction((sp) =>
            row.decision === "merge" && row.duplicateMemberId
              ? this.merge(sp, partyId, row, row.duplicateMemberId)
              : this.create(sp, partyId, row),
          );
          result = row.decision === "merge" ? "merged" : "created";
          memberId = out.memberId;
          if (out.warning) issues.push(out.warning);
        } catch {
          result = "failed";
        }
      }
      await tx
        .update(memberImportRows)
        .set({ result, memberId, issues, updatedAt: new Date() })
        .where(eq(memberImportRows.id, row.id));
    }
    // Battement : l'import n'est pas repris par un autre worker tant qu'il avance.
    await tx.update(memberImports).set({ updatedAt: new Date() }).where(eq(memberImports.id, importId));
    return rows.length;
  }

  private async identityOf(tx: Tx, partyId: string, row: typeof memberImportRows.$inferSelect) {
    const d = row.data as RowData;
    if (!d.identity) return null;
    const key = await this.deps.keys.byVersion(tx, partyId, d.identity.v);
    const value = open(
      deriveKey(key.dek, "import-enc"),
      Buffer.from(d.identity.sealed, "base64"),
      sealAad(partyId, row.importId, row.line, d.identity.kind, d.identity.v),
    ).toString();
    return { kind: d.identity.kind, value };
  }

  /** Compte de connexion par l'adresse e-mail, s'il est libre ; sinon la fiche est créée sans compte. */
  private async userFor(tx: Tx, email: string | null): Promise<string | null> {
    if (!email) return null;
    const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (u) return u.id;
    const [created] = await tx.insert(users).values({ email }).returning({ id: users.id });
    return created!.id;
  }

  private async create(tx: Tx, partyId: string, row: typeof memberImportRows.$inferSelect) {
    const d = row.data as RowData;
    const [zone] = await tx
      .select({ code: zones.code, level: zones.level })
      .from(zones)
      .where(eq(zones.id, row.zoneId!));
    const diaspora = zone!.level.startsWith("diaspora");
    const values = {
      partyId,
      memberNumber: await nextMemberNumber(tx, partyId),
      firstName: d.firstName,
      lastName: d.lastName,
      birthDate: d.birthDate,
      phoneE164: d.phone,
      zoneId: row.zoneId!,
      isDiaspora: diaspora,
      residenceCountry: diaspora ? (zone!.code.split("-")[1] ?? null) : "HT",
      statusId: d.statusId,
      tags: d.tags,
      applicationState: "approved" as const,
      joinedAt: d.joinedAt ? new Date(`${d.joinedAt}T12:00:00Z`) : new Date(),
    };
    let warning: string | null = null;
    // L'adresse appartient peut-être déjà à un membre d'une autre organisation (un compte, une adhésion) : on ne le
    // dit pas, la fiche est créée sans compte et la ligne le signale.
    const userId = await this.userFor(tx, d.email);
    let m: { id: string } | undefined;
    try {
      [m] = await tx.transaction((sp) =>
        sp
          .insert(members)
          .values({ ...values, userId })
          .returning({ id: members.id }),
      );
    } catch (e) {
      if ((e as { cause?: { code?: string } }).cause?.code !== "23505" || !userId) throw e;
      [m] = await tx
        .insert(members)
        .values({ ...values, userId: null })
        .returning({ id: members.id });
      warning = "email_in_use";
    }
    const memberId = m!.id;
    const identity = await this.identityOf(tx, partyId, row);
    if (identity) await this.deps.identity.store(tx, partyId, memberId, identity.kind, identity.value);
    await onApproved(tx, partyId, memberId);
    // Échéances à partir d'aujourd'hui : l'historique des cotisations s'importe à part (ADH-10).
    await this.deps.dues.onMemberApproved(tx, partyId, memberId, new Date());
    return { memberId, warning };
  }

  /** Fusion : seuls les champs vides du membre existant sont complétés ; rien n'est écrasé. */
  private async merge(tx: Tx, partyId: string, row: typeof memberImportRows.$inferSelect, memberId: string) {
    const d = row.data as RowData;
    const [m] = await tx
      .select({
        phone: members.phoneE164,
        birthDate: members.birthDate,
        statusId: members.statusId,
        userId: members.userId,
        tags: members.tags,
      })
      .from(members)
      .where(and(eq(members.id, memberId), isNull(members.deletedAt)));
    if (!m) throw new Error("membre fusionné introuvable");
    await tx
      .update(members)
      .set({
        phoneE164: m.phone ?? d.phone,
        birthDate: m.birthDate ?? d.birthDate,
        statusId: m.statusId ?? d.statusId,
        tags: [...new Set([...m.tags, ...d.tags])].slice(0, 30),
        updatedAt: new Date(),
      })
      .where(eq(members.id, memberId));
    let warning: string | null = null;
    if (!m.userId && d.email) {
      const userId = await this.userFor(tx, d.email);
      try {
        await tx.transaction((sp) => sp.update(members).set({ userId }).where(eq(members.id, memberId)));
      } catch {
        warning = "email_in_use";
      }
    }
    const identity = await this.identityOf(tx, partyId, row);
    if (identity) {
      const [has] = await tx
        .select({ id: memberIdentities.id })
        .from(memberIdentities)
        .where(and(eq(memberIdentities.memberId, memberId), eq(memberIdentities.kind, identity.kind)));
      if (!has) await this.deps.identity.store(tx, partyId, memberId, identity.kind, identity.value);
    }
    return { memberId, warning };
  }

  /** Fin : synthèse, audit, et suppression du fichier déposé (pièces d'identité en clair). */
  private async finish(partyId: string, importId: string, fileId: string | null) {
    const key = await withParty(partyId, async (tx) => {
      const counts = await tx
        .select({ result: memberImportRows.result, n: sql<number>`count(*)::int` })
        .from(memberImportRows)
        .where(eq(memberImportRows.importId, importId))
        .groupBy(memberImportRows.result);
      const result = Object.fromEntries(counts.map((c) => [c.result ?? "pending", c.n]));
      const [imp] = await tx
        .select({ report: memberImports.report })
        .from(memberImports)
        .where(eq(memberImports.id, importId));
      await tx
        .update(memberImports)
        .set({ state: "done", report: { ...((imp?.report as object) ?? {}), result }, updatedAt: new Date() })
        .where(eq(memberImports.id, importId));
      await audit(tx, {
        partyId,
        actorUserId: null,
        actorKind: "system",
        action: "members.import",
        targetType: "member_import",
        targetId: importId,
        metadata: result,
      });
      if (!fileId) return null;
      const [f] = await tx
        .update(files)
        .set({ trashedAt: new Date(), updatedAt: new Date() })
        .where(eq(files.id, fileId))
        .returning({ key: files.r2Key });
      return f?.key ?? null;
    });
    if (key) await this.deps.storage.delete(key).catch(() => undefined);
  }

  /** ADH-09 : invitations par e-mail des membres créés, envoyées par le worker. */
  async requestInvites(req: Req, id: string) {
    this.guard(req);
    return withParty(req.partyId, async (tx) => {
      const imp = await this.load(tx, req, id);
      if (imp.state !== "done") throw new ApiError(409, "import_not_done");
      const [{ n } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(memberImportRows)
        // Seules les fiches liées à un compte (adresse e-mail libre) reçoivent l'invitation.
        .innerJoin(
          members,
          and(eq(members.partyId, memberImportRows.partyId), eq(members.id, memberImportRows.memberId)),
        )
        .where(
          and(
            eq(memberImportRows.importId, id),
            eq(memberImportRows.result, "created"),
            isNull(memberImportRows.invitedAt),
            isNotNull(members.userId),
          ),
        );
      await tx
        .update(memberImports)
        .set({ inviteRequestedAt: new Date(), updatedAt: new Date() })
        .where(eq(memberImports.id, id));
      await audit(tx, {
        ...actor(req),
        action: "members.import.invite",
        targetType: "member_import",
        targetId: id,
        metadata: { email: n },
      });
      return { queued: n };
    });
  }

  private async partyInfo(tx: Tx) {
    const [p] = await tx.select({ name: parties.name, slug: parties.slug }).from(parties);
    return { name: p!.name, link: this.deps.partyOrigin.replace("{slug}", p!.slug) };
  }

  /** Worker : 100 invitations au plus par passage et par parti ; chaque envoi réussi est noté (jamais deux fois). */
  async sendInvites(partyId: string): Promise<{ sent: number }> {
    const batch = await withParty(partyId, async (tx) => {
      const rows = await tx
        .select({
          id: memberImportRows.id,
          email: users.email,
          locale: users.locale,
          firstName: members.firstName,
          number: members.memberNumber,
        })
        .from(memberImportRows)
        .innerJoin(
          memberImports,
          and(eq(memberImports.partyId, memberImportRows.partyId), eq(memberImports.id, memberImportRows.importId)),
        )
        .innerJoin(
          members,
          and(eq(members.partyId, memberImportRows.partyId), eq(members.id, memberImportRows.memberId)),
        )
        .innerJoin(users, eq(users.id, members.userId))
        .where(
          and(
            isNotNull(memberImports.inviteRequestedAt),
            eq(memberImportRows.result, "created"),
            isNull(memberImportRows.invitedAt),
          ),
        )
        .limit(100);
      return { rows, party: rows.length ? await this.partyInfo(tx) : null };
    });
    let sent = 0;
    for (const r of batch.rows) {
      if (!r.email) continue;
      const msg = INVITE_MESSAGES[(r.locale === "ht" ? "ht" : "fr") as MessageLocale];
      await this.deps.email.send({
        to: r.email,
        subject: msg.subject(batch.party!.name),
        text: msg.text({
          party: batch.party!.name,
          firstName: r.firstName,
          number: r.number,
          email: r.email,
          link: batch.party!.link,
        }),
      });
      await withParty(partyId, (tx) =>
        tx.update(memberImportRows).set({ invitedAt: new Date() }).where(eq(memberImportRows.id, r.id)),
      );
      sent++;
    }
    return { sent };
  }

  /** ADH-09 : liens WhatsApp prérédigés des membres créés qui ont un téléphone, 50 par page. */
  async whatsapp(req: Req, id: string, page: number, locale: MessageLocale) {
    this.guard(req);
    return withParty(req.partyId, async (tx) => {
      const imp = await this.load(tx, req, id);
      if (imp.state !== "done") throw new ApiError(409, "import_not_done");
      const where = and(
        eq(memberImportRows.importId, id),
        eq(memberImportRows.result, "created"),
        isNotNull(members.phoneE164),
      );
      const rows = await tx
        .select({
          firstName: members.firstName,
          lastName: members.lastName,
          number: members.memberNumber,
          phone: members.phoneE164,
        })
        .from(memberImportRows)
        .innerJoin(
          members,
          and(eq(members.partyId, memberImportRows.partyId), eq(members.id, memberImportRows.memberId)),
        )
        .where(where)
        .orderBy(asc(memberImportRows.line))
        .limit(50)
        .offset((page - 1) * 50);
      const [{ n } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(memberImportRows)
        .innerJoin(
          members,
          and(eq(members.partyId, memberImportRows.partyId), eq(members.id, memberImportRows.memberId)),
        )
        .where(where);
      const party = await this.partyInfo(tx);
      const msg = INVITE_MESSAGES[locale];
      return {
        total: n,
        links: rows.map((r) => ({
          name: `${r.firstName} ${r.lastName}`,
          number: r.number,
          phone: r.phone,
          url: `https://wa.me/${r.phone!.slice(1)}?text=${encodeURIComponent(msg.whatsapp({ party: party.name, firstName: r.firstName, number: r.number, link: party.link }))}`,
        })),
      };
    });
  }
}
