import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../plugins/auth.js";
import { EventsService, eventCreate, eventUpdate, eventsQuery, manageEventsQuery } from "../events/service.js";
import { PushService, deviceBody, pushCampaign } from "./push.js";
import type { PushSender } from "../../lib/messaging/push.js";
import { audienceInput } from "../../lib/audience.js";
import type { FilesService } from "../files/service.js";
import {
  PublicationsService,
  feedQuery,
  manageQuery,
  publicationCreate,
  publicationUpdate,
  publishBody,
} from "./publications.js";

const idParam = z.object({ id: z.string().uuid() });

/** COM-01 (publications) et ENG-03 (agenda). */
export default async function communicationRoutes(
  app: FastifyInstance,
  opts: { push: PushSender; files: FilesService },
) {
  const push = new PushService(opts.push);
  const pubs = new PublicationsService(opts.files);
  const events = new EventsService();
  const auth = { preHandler: requireAuth };

  app.get("/feed", auth, async (req) => pubs.feed(req, feedQuery.parse(req.query)));
  app.get("/publications", auth, async (req) => ({
    publications: await pubs.manageList(req, manageQuery.parse(req.query).status),
  }));
  app.post("/publications", auth, async (req, reply) =>
    reply.code(201).send(await pubs.create(req, publicationCreate.parse(req.body))),
  );
  app.patch("/publications/:id", auth, async (req, reply) => {
    await pubs.update(req, idParam.parse(req.params).id, publicationUpdate.parse(req.body));
    return reply.code(204).send();
  });
  app.post("/publications/:id/publish", auth, async (req, reply) => {
    await pubs.publish(req, idParam.parse(req.params).id, publishBody.parse(req.body ?? {}).at);
    return reply.code(204).send();
  });
  app.post("/publications/:id/unpublish", auth, async (req, reply) => {
    await pubs.unpublish(req, idParam.parse(req.params).id);
    return reply.code(204).send();
  });

  app.get("/events", auth, async (req) => ({ events: await events.list(req, eventsQuery.parse(req.query)) }));
  app.get("/events/manage", auth, async (req) => ({
    events: await events.manageList(req, manageEventsQuery.parse(req.query)),
  }));
  app.patch("/events/:id", auth, async (req, reply) => {
    await events.update(req, idParam.parse(req.params).id, eventUpdate.parse(req.body));
    return reply.code(204).send();
  });
  app.post("/events", auth, async (req, reply) =>
    reply.code(201).send(await events.create(req, eventCreate.parse(req.body))),
  );
  app.post("/events/:id/registration", auth, async (req, reply) => {
    await events.register(req, idParam.parse(req.params).id);
    return reply.code(204).send();
  });
  app.delete("/events/:id/registration", auth, async (req, reply) => {
    await events.unregister(req, idParam.parse(req.params).id);
    return reply.code(204).send();
  });
  app.get("/events/:id/registrations", auth, async (req) => ({
    registrations: await events.registrations(req, idParam.parse(req.params).id),
  }));

  // COM-02 : notifications push.
  app.post("/devices", auth, async (req, reply) => {
    await push.registerDevice(req, deviceBody.parse(req.body));
    return reply.code(204).send();
  });
  app.delete("/devices/:token", auth, async (req, reply) => {
    await push.removeDevice(req, z.object({ token: z.string().min(1).max(4096) }).parse(req.params).token);
    return reply.code(204).send();
  });
  // Portée d'une audience avant de publier ou d'envoyer (nombre de membres visés et joignables).
  app.post("/audience/estimate", auth, async (req) => {
    const b = z
      .object({ audience: audienceInput.default(null), for: z.enum(["push", "publication"]).default("push") })
      .parse(req.body ?? {});
    return push.estimate(req, b.audience, b.for === "push" ? "outreach.send" : "publications.manage");
  });
  app.get("/outreach", auth, async (req) => ({ campaigns: await push.list(req) }));
  app.post("/outreach/push", auth, async (req, reply) =>
    reply.code(201).send(await push.create(req, pushCampaign.parse(req.body))),
  );
  app.post("/outreach/:id/cancel", auth, async (req, reply) => {
    await push.cancel(req, idParam.parse(req.params).id);
    return reply.code(204).send();
  });
}
