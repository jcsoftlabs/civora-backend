// ENG-03 : agenda et événements avec inscription. Visibilité : tout le parti, une zone, ou les membres d'un organe.
import { randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { and, asc, count, desc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { eventRegistrations, events, members, organs, withParty, zones, type Tx } from "@civora/db";
import { audit } from "../../lib/audit.js";
import { currentMember } from "../../lib/member-context.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize, zoneWithin } from "../../plugins/tenant.js";

const text = (max: number) =>
  z.object({ fr: z.string().trim().min(1).max(max), ht: z.string().trim().max(max).optional() });
export const EVENT_KINDS = ["rassemblement", "reunion", "congres", "formation"] as const;

export const eventCreate = z
  .object({
    kind: z.enum(EVENT_KINDS),
    title: text(160),
    description: text(5000).optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    zoneCode: z
      .string()
      .regex(/^[A-Z0-9-]{2,20}$/)
      .optional(),
    organId: z.string().uuid().optional(),
    address: z.string().trim().max(300).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    capacity: z.number().int().min(1).max(1_000_000).optional(),
  })
  .refine((e) => e.endsAt > e.startsAt, { message: "fin avant le début", path: ["endsAt"] });
export const eventsQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
export const eventUpdate = z
  .object({
    title: text(160),
    description: text(5000).nullable(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    address: z.string().trim().max(300).nullable(),
    capacity: z.number().int().min(1).max(1_000_000).nullable(),
  })
  .partial();
export const manageEventsQuery = z.object({ period: z.enum(["upcoming", "past"]).default("upcoming") });

type Req = FastifyRequest;

/** Un événement est visible du membre si sa zone contient celle du membre, et s'il est membre de l'organe visé. */
function visibleTo(me: Awaited<ReturnType<typeof currentMember>>) {
  return sql`(
    ("events"."zone_id" is null or exists (select 1 from zones z where z.id = "events"."zone_id" and ${me.sql.zonePath} <@ z.path))
    and ("events"."organ_id" is null or exists (
      select 1 from organ_members om where om.organ_id = "events"."organ_id" and om.member_id = ${me.sql.memberId}))
  )`;
}

async function eventScope(tx: Tx, id: string) {
  const [e] = await tx
    .select({
      id: events.id,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      capacity: events.capacity,
      zonePath: zones.path,
    })
    .from(events)
    .leftJoin(zones, eq(zones.id, events.zoneId))
    .where(eq(events.id, id));
  if (!e) throw new ApiError(404, "not_found");
  return e;
}

export class EventsService {
  async create(req: Req, body: z.infer<typeof eventCreate>) {
    return withParty(req.partyId, async (tx) => {
      let zone: { id: string; path: string } | null = null;
      if (body.zoneCode) {
        const [z] = await tx
          .select({ id: zones.id, path: zones.path })
          .from(zones)
          .where(eq(zones.code, body.zoneCode));
        if (!z) throw new ApiError(400, "zone_not_found");
        zone = z;
      }
      if (!authorize(req, "events.manage", zone?.path)) throw new ApiError(403, "forbidden");
      if (body.organId) {
        const [o] = await tx
          .select({ path: zones.path })
          .from(organs)
          .leftJoin(zones, eq(zones.id, organs.zoneId))
          .where(eq(organs.id, body.organId));
        if (!o) throw new ApiError(400, "organ_not_found");
        // Un événement d'organe se tient dans la zone de l'organe.
        if (o.path && (!zone || !zoneWithin(zone.path, o.path))) throw new ApiError(400, "event_zone_outside_organ");
      }
      const [e] = await tx
        .insert(events)
        .values({
          partyId: req.partyId,
          kind: body.kind,
          title: body.title,
          description: body.description ?? null,
          startsAt: body.startsAt,
          endsAt: body.endsAt,
          zoneId: zone?.id ?? null,
          organId: body.organId ?? null,
          address: body.address ?? null,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          capacity: body.capacity ?? null,
          // Secret du QR de présence (PRE-02), propre à chaque événement.
          qrSecretRef: randomBytes(32).toString("base64url"),
        })
        .returning({ id: events.id });
      await audit(tx, {
        partyId: req.partyId,
        actorUserId: req.auth?.userId ?? null,
        actorKind: "member",
        action: "event.create",
        targetType: "event",
        targetId: e!.id,
        metadata: { kind: body.kind, zone: body.zoneCode ?? null },
        ip: req.clientIp,
      });
      return { id: e!.id };
    });
  }

  /** Agenda du membre : événements visibles, à venir par défaut, avec places restantes et son inscription. */
  async list(req: Req, q: z.infer<typeof eventsQuery>) {
    return withParty(req.partyId, async (tx) => {
      const me = await currentMember(tx, req.memberId!);
      const from = q.from ?? new Date();
      const rows = await tx
        .select({
          id: events.id,
          kind: events.kind,
          title: events.title,
          description: events.description,
          startsAt: events.startsAt,
          endsAt: events.endsAt,
          address: events.address,
          latitude: events.latitude,
          longitude: events.longitude,
          capacity: events.capacity,
          registered: sql<number>`(select count(*)::int from event_registrations r where r.event_id = "events"."id")`,
          isRegistered: sql<boolean>`exists (select 1 from event_registrations r where r.event_id = "events"."id" and r.member_id = ${me.sql.memberId})`,
        })
        .from(events)
        .where(and(gte(events.endsAt, from), q.to ? lte(events.startsAt, q.to) : undefined, visibleTo(me)))
        .orderBy(asc(events.startsAt))
        .limit(100);
      return rows.map((e) => ({
        ...e,
        placesLeft: e.capacity === null ? null : Math.max(0, e.capacity - e.registered),
      }));
    });
  }

  /** Inscription : événement visible, pas encore terminé, dans la limite des places (verrou sur l'événement). */
  async register(req: Req, id: string) {
    await withParty(req.partyId, async (tx) => {
      const me = await currentMember(tx, req.memberId!);
      const [e] = await tx
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.id, id), visibleTo(me)))
        .for("update");
      if (!e) throw new ApiError(404, "not_found");
      const ev = await eventScope(tx, id);
      if (ev.endsAt <= new Date()) throw new ApiError(409, "event_finished");
      const [already] = await tx
        .select({ id: eventRegistrations.id })
        .from(eventRegistrations)
        .where(and(eq(eventRegistrations.eventId, id), eq(eventRegistrations.memberId, me.id)));
      if (already) return;
      if (ev.capacity !== null) {
        const [n] = await tx.select({ n: count() }).from(eventRegistrations).where(eq(eventRegistrations.eventId, id));
        if ((n?.n ?? 0) >= ev.capacity) throw new ApiError(409, "event_full");
      }
      await tx.insert(eventRegistrations).values({ partyId: req.partyId, eventId: id, memberId: me.id });
    });
  }

  async unregister(req: Req, id: string) {
    await withParty(req.partyId, async (tx) => {
      const ev = await eventScope(tx, id);
      if (ev.startsAt <= new Date()) throw new ApiError(409, "event_started");
      await tx
        .delete(eventRegistrations)
        .where(and(eq(eventRegistrations.eventId, id), eq(eventRegistrations.memberId, req.memberId!)));
    });
  }

  /**
   * Événements que la personne organise (events.manage) : ceux de sa zone et de ses sous-zones, ou tous pour un
   * poste national ; à venir (du plus proche au plus lointain) ou passés (du plus récent au plus ancien).
   */
  async manageList(req: Req, q: z.infer<typeof manageEventsQuery>) {
    const scopes = req.grants.filter((g) => g.permission === "events.manage");
    if (!scopes.length) throw new ApiError(403, "forbidden");
    const national = scopes.some((g) => g.zonePath === null);
    const now = new Date();
    const rows = await withParty(req.partyId, (tx) =>
      tx
        .select({
          id: events.id,
          kind: events.kind,
          title: events.title,
          description: events.description,
          startsAt: events.startsAt,
          endsAt: events.endsAt,
          address: events.address,
          capacity: events.capacity,
          zoneCode: zones.code,
          zoneName: zones.name,
          zonePath: zones.path,
          organId: events.organId,
          organName: sql<string | null>`(select o.name from organs o where o.id = "events"."organ_id")`,
          registered: sql<number>`(select count(*)::int from event_registrations r where r.event_id = "events"."id")`,
        })
        .from(events)
        .leftJoin(zones, eq(zones.id, events.zoneId))
        .where(q.period === "past" ? lt(events.endsAt, now) : gte(events.endsAt, now))
        .orderBy(q.period === "past" ? desc(events.startsAt) : asc(events.startsAt))
        .limit(200),
    );
    return rows
      .filter((e) => national || (e.zonePath !== null && scopes.some((g) => zoneWithin(e.zonePath!, g.zonePath!))))
      .map(({ zonePath: _p, ...e }) => e);
  }

  /** Modification par un responsable de la zone ; la capacité ne descend pas sous le nombre d'inscrits. */
  async update(req: Req, id: string, body: z.infer<typeof eventUpdate>) {
    await withParty(req.partyId, async (tx) => {
      const ev = await eventScope(tx, id);
      if (!authorize(req, "events.manage", ev.zonePath ?? undefined)) throw new ApiError(403, "forbidden");
      const startsAt = body.startsAt ?? ev.startsAt;
      const endsAt = body.endsAt ?? ev.endsAt;
      if (endsAt <= startsAt) throw new ApiError(400, "event_ends_before_start");
      if (body.capacity) {
        const [n] = await tx.select({ n: count() }).from(eventRegistrations).where(eq(eventRegistrations.eventId, id));
        if ((n?.n ?? 0) > body.capacity) throw new ApiError(409, "capacity_below_registered");
      }
      await tx
        .update(events)
        .set({
          ...(body.title ? { title: body.title } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.address !== undefined ? { address: body.address } : {}),
          ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
          startsAt,
          endsAt,
          updatedAt: new Date(),
        })
        .where(eq(events.id, id));
      await audit(tx, {
        partyId: req.partyId,
        actorUserId: req.auth?.userId ?? null,
        actorKind: "member",
        action: "event.update",
        targetType: "event",
        targetId: id,
        metadata: { fields: Object.keys(body) },
        ip: req.clientIp,
      });
    });
  }

  /** Liste des inscrits : responsable des événements dans la zone de l'événement. */
  async registrations(req: Req, id: string) {
    return withParty(req.partyId, async (tx) => {
      const ev = await eventScope(tx, id);
      if (!authorize(req, "events.manage", ev.zonePath ?? undefined)) throw new ApiError(403, "forbidden");
      return tx
        .select({
          memberId: members.id,
          memberNumber: members.memberNumber,
          firstName: members.firstName,
          lastName: members.lastName,
          registeredAt: eventRegistrations.createdAt,
        })
        .from(eventRegistrations)
        .innerJoin(
          members,
          and(eq(members.partyId, eventRegistrations.partyId), eq(members.id, eventRegistrations.memberId)),
        )
        .where(and(eq(eventRegistrations.eventId, id), isNull(members.deletedAt)))
        .orderBy(asc(eventRegistrations.createdAt));
    });
  }
}
