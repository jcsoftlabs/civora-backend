import type { FastifyInstance } from "fastify";
import { messageLocale } from "../../lib/messaging/templates.js";
import { requireAuth } from "../../plugins/auth.js";
import { requireFeature } from "../../plugins/tenant.js";
import type { FilesService } from "../files/service.js";
import { certificatePdf } from "./certificate-pdf.js";
import {
  attemptBody,
  courseCreate,
  courseUpdate,
  idParam,
  lessonCreate,
  lessonOrder,
  lessonUpdate,
  progressQuery,
} from "./schemas.js";
import { TrainingService } from "./service.js";

/** FOR-01 à FOR-03 : formules Mouvement et National ; le certificat (FOR-04) : National. */
export default async function trainingRoutes(app: FastifyInstance, opts: { files: FilesService }) {
  const svc = new TrainingService(opts.files);
  const guard = { preHandler: [requireAuth, requireFeature("training")] };
  const id = (p: unknown) => idParam.parse(p).id;

  // Back-office
  app.get("/courses", guard, async (req) => ({ courses: await svc.manageList(req) }));
  app.post("/courses", guard, async (req, reply) =>
    reply.code(201).send(await svc.create(req, courseCreate.parse(req.body))),
  );
  app.get("/courses/:id", guard, async (req) => svc.detail(req, id(req.params)));
  app.patch("/courses/:id", guard, async (req, reply) => {
    await svc.update(req, id(req.params), courseUpdate.parse(req.body));
    return reply.code(204).send();
  });
  app.post("/courses/:id/lessons", guard, async (req, reply) =>
    reply.code(201).send(await svc.addLesson(req, id(req.params), lessonCreate.parse(req.body))),
  );
  app.put("/courses/:id/lessons/order", guard, async (req, reply) => {
    await svc.reorder(req, id(req.params), lessonOrder.parse(req.body).lessonIds);
    return reply.code(204).send();
  });
  app.patch("/lessons/:id", guard, async (req, reply) => {
    await svc.updateLesson(req, id(req.params), lessonUpdate.parse(req.body));
    return reply.code(204).send();
  });
  app.delete("/lessons/:id", guard, async (req, reply) => {
    await svc.deleteLesson(req, id(req.params));
    return reply.code(204).send();
  });
  app.get("/courses/:id/progress", guard, async (req) =>
    svc.progress(req, id(req.params), progressQuery.parse(req.query).zone),
  );

  // Membre
  app.get("/training", guard, async (req) => ({ courses: await svc.myCourses(req) }));
  app.get("/training/:id", guard, async (req) => svc.myCourse(req, id(req.params)));
  app.post("/training/lessons/:id/read", guard, async (req) => svc.markRead(req, id(req.params)));
  app.post(
    "/training/lessons/:id/attempt",
    {
      ...guard,
      config: {
        rateLimit: { max: 30, timeWindow: "10 minutes", keyGenerator: (r) => r.auth?.sessionId ?? r.clientIp },
      },
    },
    async (req) => svc.attempt(req, id(req.params), attemptBody.parse(req.body)),
  );
  app.get(
    "/training/:id/certificate",
    { preHandler: [requireAuth, requireFeature("training"), requireFeature("training.certificates")] },
    async (req, reply) => {
      const c = await svc.certificate(req, id(req.params));
      const body = await certificatePdf(
        c,
        messageLocale(req.headers["accept-language"]?.startsWith("ht") ? "ht" : "fr"),
      );
      return reply
        .header("content-type", "application/pdf")
        .header("content-disposition", `attachment; filename="certificat-${c.number}.pdf"`)
        .header("cache-control", "no-store")
        .send(body);
    },
  );
}
