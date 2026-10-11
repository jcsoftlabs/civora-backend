// ORG-01 à ORG-04, SOC-06, SEC-05 : organes rattachés au territoire, postes libres, droits attachés au poste.
import type { FastifyRequest } from "fastify";
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { members, organs, postHolders, posts, withParty, zones, type Tx } from "@civora/db";
import { canStructureAt, requiredTier, type Entitlements, type Permission, type ZoneLevel } from "@civora/shared";
import { audit } from "../../lib/audit.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize, holdsAll, zoneWithin } from "../../plugins/tenant.js";
import type { holderAssign, organCreate, organUpdate, postCreate, postUpdate } from "./schemas.js";
import type { z } from "zod";

type Req = FastifyRequest;
interface Zone {
  id: string;
  code: string;
  path: string;
  level: ZoneLevel;
}

async function entitlementsOf(req: Req): Promise<Entitlements> {
  const e = req.partyEntitlements ?? (await req.server.entitlements.get(req.partyId));
  if (!e) throw new ApiError(401, "unauthenticated");
  return e;
}

async function zoneByCode(tx: Tx, code: string): Promise<Zone> {
  const [z] = await tx
    .select({ id: zones.id, code: zones.code, path: zones.path, level: zones.level })
    .from(zones)
    .where(eq(zones.code, code));
  if (!z) throw new ApiError(400, "zone_not_found");
  return z;
}

/** ORG-03 : un organe ou un poste ne se rattache qu'aux niveaux ouverts par le palier. */
function assertLevelInPlan(e: Entitlements, z: Zone | null) {
  if (z && !canStructureAt(e, z.level)) {
    const feature = z.level === "section_communale" ? "territory.sectionCommunale" : "territory.departement";
    throw Object.assign(new ApiError(402, "zone_level_not_in_plan"), { requiredTier: requiredTier(feature) });
  }
}

async function loadOrgan(tx: Tx, id: string) {
  const [o] = await tx
    .select({
      id: organs.id,
      name: organs.name,
      parentOrganId: organs.parentOrganId,
      zoneId: organs.zoneId,
      zonePath: zones.path,
    })
    .from(organs)
    .leftJoin(zones, eq(zones.id, organs.zoneId))
    .where(eq(organs.id, id));
  if (!o) throw new ApiError(404, "not_found");
  return o;
}

async function loadPost(tx: Tx, id: string) {
  const [p] = await tx
    .select({
      id: posts.id,
      organId: posts.organId,
      title: posts.title,
      permissions: posts.permissions,
      scopeZoneId: posts.scopeZoneId,
      scopePath: zones.path,
    })
    .from(posts)
    .leftJoin(zones, eq(zones.id, posts.scopeZoneId))
    .where(eq(posts.id, id));
  if (!p) throw new ApiError(404, "not_found");
  return { ...p, permissions: p.permissions as Permission[] };
}

const path = (p: string | null) => p ?? undefined;
const actor = (req: Req) => ({
  partyId: req.partyId,
  actorUserId: req.auth?.userId ?? null,
  actorKind: "member" as const,
  ip: req.clientIp,
});

/** Organes visibles : tous pour un poste national, sinon ceux des zones où la personne gère les organes. */
export async function listOrgans(req: Req) {
  const scopes = req.grants.filter((g) => g.permission === "organs.manage");
  if (!scopes.length) throw new ApiError(403, "forbidden");
  const national = scopes.some((g) => g.zonePath === null);
  return withParty(req.partyId, async (tx) => {
    const rows = await tx
      .select({
        id: organs.id,
        name: organs.name,
        kind: organs.kind,
        parentOrganId: organs.parentOrganId,
        zoneCode: zones.code,
        zoneName: zones.name,
        zoneLevel: zones.level,
        zonePath: zones.path,
        postCount: sql<number>`(select count(*)::int from posts p where p.organ_id = "organs"."id")`,
        memberCount: sql<number>`(select count(*)::int from organ_members m where m.organ_id = "organs"."id")`,
      })
      .from(organs)
      .leftJoin(zones, eq(zones.id, organs.zoneId))
      .orderBy(asc(organs.name));
    const visible = rows.filter(
      (o) => national || (o.zonePath !== null && scopes.some((g) => zoneWithin(o.zonePath!, g.zonePath!))),
    );
    // Titulaires en cours de chaque organe : pile d'avatars des responsables sur la grille.
    const now = new Date();
    const holders = visible.length
      ? await tx
          .select({
            organId: posts.organId,
            postTitle: posts.title,
            memberId: members.id,
            firstName: members.firstName,
            lastName: members.lastName,
          })
          .from(postHolders)
          .innerJoin(posts, and(eq(posts.partyId, postHolders.partyId), eq(posts.id, postHolders.postId)))
          .innerJoin(members, and(eq(members.partyId, postHolders.partyId), eq(members.id, postHolders.memberId)))
          .where(
            and(
              inArray(
                posts.organId,
                visible.map((o) => o.id),
              ),
              lte(postHolders.startsAt, now),
              or(isNull(postHolders.endsAt), gt(postHolders.endsAt, now)),
            ),
          )
          .orderBy(asc(postHolders.startsAt))
      : [];
    return visible.map(({ zonePath: _p, ...o }) => {
      const mine = holders.filter((h) => h.organId === o.id);
      const filled = new Set(mine.map((h) => h.postTitle));
      return {
        ...o,
        holders: mine.slice(0, 5).map(({ organId: _o, ...h }) => h),
        holderCount: mine.length,
        vacantPosts: Math.max(0, o.postCount - filled.size),
      };
    });
  });
}

export async function createOrgan(req: Req, body: z.infer<typeof organCreate>) {
  const e = await entitlementsOf(req);
  return withParty(req.partyId, async (tx) => {
    const zone = body.zoneCode ? await zoneByCode(tx, body.zoneCode) : null;
    if (!authorize(req, "organs.manage", zone?.path)) throw new ApiError(403, "forbidden");
    assertLevelInPlan(e, zone);
    if (body.parentOrganId) {
      const parent = await loadOrgan(tx, body.parentOrganId);
      // Un sous-organe reste dans la zone de son organe parent (une coordination départementale ne crée pas
      // de section dans un autre département).
      if (parent.zonePath && (!zone || !zoneWithin(zone.path, parent.zonePath))) {
        throw new ApiError(400, "organ_zone_outside_parent");
      }
    }
    const [o] = await tx
      .insert(organs)
      .values({
        partyId: req.partyId,
        name: body.name,
        kind: body.kind,
        zoneId: zone?.id ?? null,
        parentOrganId: body.parentOrganId ?? null,
      })
      .returning({ id: organs.id });
    await audit(tx, {
      ...actor(req),
      action: "organ.create",
      targetType: "organ",
      targetId: o!.id,
      metadata: { zone: zone?.code ?? null },
    });
    return { id: o!.id };
  });
}

export async function updateOrgan(req: Req, id: string, body: z.infer<typeof organUpdate>) {
  const e = await entitlementsOf(req);
  return withParty(req.partyId, async (tx) => {
    const organ = await loadOrgan(tx, id);
    if (!authorize(req, "organs.manage", path(organ.zonePath))) throw new ApiError(403, "forbidden");
    let zoneId: string | null | undefined;
    if (body.zoneCode !== undefined) {
      const zone = await zoneByCode(tx, body.zoneCode);
      if (!authorize(req, "organs.manage", zone.path)) throw new ApiError(403, "forbidden");
      assertLevelInPlan(e, zone);
      if (organ.parentOrganId) {
        const parent = await loadOrgan(tx, organ.parentOrganId);
        if (parent.zonePath && !zoneWithin(zone.path, parent.zonePath))
          throw new ApiError(400, "organ_zone_outside_parent");
      }
      // Les sous-organes et les postes doivent rester dans la nouvelle zone.
      const [outside] = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from (
          select z.path from organs c join zones z on z.id = c.zone_id where c.parent_organ_id = ${id}
          union all
          select z.path from posts p join zones z on z.id = p.scope_zone_id where p.organ_id = ${id}
        ) t where not (t.path <@ ${zone.path}::ltree)`);
      if ((outside?.n ?? 0) > 0) throw new ApiError(409, "organ_children_outside_zone");
      zoneId = zone.id;
    }
    await tx
      .update(organs)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.kind ? { kind: body.kind } : {}),
        ...(zoneId ? { zoneId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(organs.id, id));
    await audit(tx, {
      ...actor(req),
      action: "organ.update",
      targetType: "organ",
      targetId: id,
      metadata: { fields: Object.keys(body) },
    });
  });
}

/** Postes d'un organe, avec leurs titulaires en cours. */
export async function listPosts(req: Req, organId: string) {
  return withParty(req.partyId, async (tx) => {
    const organ = await loadOrgan(tx, organId);
    if (!authorize(req, "organs.manage", path(organ.zonePath))) throw new ApiError(403, "forbidden");
    const rows = await tx
      .select({
        id: posts.id,
        title: posts.title,
        permissions: posts.permissions,
        scopeCode: zones.code,
        filledBy: posts.filledBy,
      })
      .from(posts)
      .leftJoin(zones, eq(zones.id, posts.scopeZoneId))
      .where(eq(posts.organId, organId))
      .orderBy(asc(posts.title));
    const now = new Date();
    const holders = rows.length
      ? await tx
          .select({
            id: postHolders.id,
            postId: postHolders.postId,
            memberId: members.id,
            firstName: members.firstName,
            lastName: members.lastName,
            startsAt: postHolders.startsAt,
          })
          .from(postHolders)
          .innerJoin(members, and(eq(members.partyId, postHolders.partyId), eq(members.id, postHolders.memberId)))
          .where(
            and(
              inArray(
                postHolders.postId,
                rows.map((r) => r.id),
              ),
              lte(postHolders.startsAt, now),
              or(isNull(postHolders.endsAt), gt(postHolders.endsAt, now)),
            ),
          )
      : [];
    return rows.map((p) => ({
      ...p,
      holders: holders.filter((h) => h.postId === p.id).map(({ postId: _p, ...h }) => h),
    }));
  });
}

export async function createPost(req: Req, organId: string, body: z.infer<typeof postCreate>) {
  const e = await entitlementsOf(req);
  return withParty(req.partyId, async (tx) => {
    const organ = await loadOrgan(tx, organId);
    if (!authorize(req, "organs.manage", path(organ.zonePath))) throw new ApiError(403, "forbidden");
    const scope = body.scopeZoneCode ? await zoneByCode(tx, body.scopeZoneCode) : null;
    // Portée par défaut : la zone de l'organe. Un poste d'un organe local n'est jamais national.
    if (organ.zonePath && scope && !zoneWithin(scope.path, organ.zonePath))
      throw new ApiError(400, "post_scope_outside_organ");
    const scopeZoneId = scope?.id ?? organ.zoneId;
    const scopePath = scope?.path ?? organ.zonePath;
    assertLevelInPlan(e, scope);
    if (!holdsAll(req, body.permissions, path(scopePath))) throw new ApiError(403, "privilege_escalation");
    const [p] = await tx
      .insert(posts)
      .values({ partyId: req.partyId, organId, title: body.title, permissions: body.permissions, scopeZoneId })
      .returning({ id: posts.id });
    await audit(tx, {
      ...actor(req),
      action: "post.create",
      targetType: "post",
      targetId: p!.id,
      metadata: { organId, permissions: body.permissions },
    });
    return { id: p!.id };
  });
}

export async function updatePost(req: Req, id: string, body: z.infer<typeof postUpdate>) {
  const e = await entitlementsOf(req);
  return withParty(req.partyId, async (tx) => {
    const post = await loadPost(tx, id);
    const organ = await loadOrgan(tx, post.organId);
    if (!authorize(req, "organs.manage", path(organ.zonePath))) throw new ApiError(403, "forbidden");
    // Retirer des droits à un poste compte autant qu'en donner : il faut détenir les anciens et les nouveaux.
    if (!holdsAll(req, post.permissions, path(post.scopePath))) throw new ApiError(403, "privilege_escalation");
    let scopeZoneId = post.scopeZoneId;
    let scopePath = post.scopePath;
    if (body.scopeZoneCode !== undefined) {
      const scope = await zoneByCode(tx, body.scopeZoneCode);
      if (organ.zonePath && !zoneWithin(scope.path, organ.zonePath))
        throw new ApiError(400, "post_scope_outside_organ");
      assertLevelInPlan(e, scope);
      scopeZoneId = scope.id;
      scopePath = scope.path;
    }
    const permissions = body.permissions ?? post.permissions;
    if (!holdsAll(req, permissions, path(scopePath))) throw new ApiError(403, "privilege_escalation");
    await tx
      .update(posts)
      .set({ ...(body.title ? { title: body.title } : {}), permissions, scopeZoneId, updatedAt: new Date() })
      .where(eq(posts.id, id));
    await audit(tx, {
      ...actor(req),
      action: "post.update",
      targetType: "post",
      targetId: id,
      metadata: { before: post.permissions, after: permissions },
    });
  });
}

/**
 * Attribution d'un poste (ORG-04, audité). Les droits appartiennent au poste : le successeur les reçoit dès
 * l'attribution, et le mandat du titulaire précédent prend fin (sauf poste à plusieurs titulaires).
 */
export async function assignHolder(req: Req, postId: string, body: z.infer<typeof holderAssign>) {
  return withParty(req.partyId, async (tx) => {
    const post = await loadPost(tx, postId);
    if (!authorize(req, "posts.assign", path(post.scopePath))) throw new ApiError(403, "forbidden");
    if (!holdsAll(req, post.permissions, path(post.scopePath))) throw new ApiError(403, "privilege_escalation");
    const [member] = await tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.id, body.memberId), isNull(members.deletedAt), eq(members.applicationState, "approved")));
    if (!member) throw new ApiError(400, "member_not_eligible");

    const startsAt = body.startsAt ?? new Date();
    let replaced: string[] = [];
    if (body.replaceCurrent) {
      replaced = (
        await tx
          .update(postHolders)
          .set({ endsAt: startsAt, updatedAt: new Date() })
          .where(and(eq(postHolders.postId, postId), or(isNull(postHolders.endsAt), gt(postHolders.endsAt, startsAt))))
          .returning({ memberId: postHolders.memberId })
      ).map((r) => r.memberId);
    }
    const [h] = await tx
      .insert(postHolders)
      .values({ partyId: req.partyId, postId, memberId: body.memberId, startsAt })
      .returning({ id: postHolders.id });
    await audit(tx, {
      ...actor(req),
      action: "role.change",
      targetType: "post",
      targetId: postId,
      metadata: { assigned: body.memberId, replaced, permissions: post.permissions },
    });
    return { id: h!.id, replaced };
  });
}

/** Fin de mandat : le titulaire perd les droits du poste immédiatement. */
export async function endHolder(req: Req, postId: string, holderId: string) {
  return withParty(req.partyId, async (tx) => {
    const post = await loadPost(tx, postId);
    if (!authorize(req, "posts.assign", path(post.scopePath))) throw new ApiError(403, "forbidden");
    if (!holdsAll(req, post.permissions, path(post.scopePath))) throw new ApiError(403, "privilege_escalation");
    const now = new Date();
    const [ended] = await tx
      .update(postHolders)
      .set({ endsAt: now, updatedAt: now })
      .where(
        and(
          eq(postHolders.id, holderId),
          eq(postHolders.postId, postId),
          or(isNull(postHolders.endsAt), gt(postHolders.endsAt, now)),
        ),
      )
      .returning({ memberId: postHolders.memberId });
    if (!ended) throw new ApiError(404, "not_found");
    await audit(tx, {
      ...actor(req),
      action: "role.change",
      targetType: "post",
      targetId: postId,
      metadata: { ended: ended.memberId },
    });
  });
}
