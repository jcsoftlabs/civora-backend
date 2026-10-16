import type { FastifyInstance } from "fastify";
import { can } from "@civora/shared";
import { messageLocale } from "../../lib/messaging/templates.js";
import { requireAuth } from "../../plugins/auth.js";
import { requireFeature } from "../../plugins/tenant.js";
import type { FilesService } from "../files/service.js";
import { certificatePdf } from "./certificate-pdf.js";
import {
  attemptBody,
  certificateTemplate,
  chapterCreate,
  chapterUpdate,
  courseCreate,
  courseUpdate,
  idOrder,
  idParam,
  moduleCreate,
  moduleUpdate,
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
  app.post("/courses/:id/modules", guard, async (req, reply) =>
    reply.code(201).send(await svc.addModule(req, id(req.params), moduleCreate.parse(req.body))),
  );
  app.put("/courses/:id/modules/order", guard, async (req, reply) => {
    await svc.reorderModules(req, id(req.params), idOrder.parse(req.body).ids);
    return reply.code(204).send();
  });
  app.patch("/modules/:id", guard, async (req, reply) => {
    await svc.updateModule(req, id(req.params), moduleUpdate.parse(req.body));
    return reply.code(204).send();
  });
  app.delete("/modules/:id", guard, async (req, reply) => {
    await svc.deleteModule(req, id(req.params));
    return reply.code(204).send();
  });
  app.post("/modules/:id/chapters", guard, async (req, reply) =>
    reply.code(201).send(await svc.addChapter(req, id(req.params), chapterCreate.parse(req.body))),
  );
  app.put("/modules/:id/chapters/order", guard, async (req, reply) => {
    await svc.reorderChapters(req, id(req.params), idOrder.parse(req.body).ids);
    return reply.code(204).send();
  });
  app.patch("/chapters/:id", guard, async (req, reply) => {
    await svc.updateChapter(req, id(req.params), chapterUpdate.parse(req.body));
    return reply.code(204).send();
  });
  app.delete("/chapters/:id", guard, async (req, reply) => {
    await svc.deleteChapter(req, id(req.params));
    return reply.code(204).send();
  });
  app.get("/courses/:id/progress", guard, async (req) =>
    svc.progress(req, id(req.params), progressQuery.parse(req.query).zone),
  );

  // Membre
  app.get("/training", guard, async (req) => ({ courses: await svc.myCourses(req) }));
  // FOR-04 : l'app ne propose le certificat que si la formule du parti le comprend.
  app.get("/training/:id", guard, async (req) => ({
    ...(await svc.myCourse(req, id(req.params))),
    certificates: !!req.partyEntitlements && can(req.partyEntitlements, "training.certificates"),
  }));
  app.post("/training/chapters/:id/view", guard, async (req) => svc.markViewed(req, id(req.params)));
  app.post(
    "/training/modules/:id/attempt",
    {
      ...guard,
      config: {
        rateLimit: { max: 30, timeWindow: "10 minutes", keyGenerator: (r) => r.auth?.sessionId ?? r.clientIp },
      },
    },
    async (req) => svc.attempt(req, id(req.params), attemptBody.parse(req.body)),
  );
  // Modèle de certificat du parti (FOR-04)
  const certGuard = { preHandler: [requireAuth, requireFeature("training"), requireFeature("training.certificates")] };
  const locale = (h: string | undefined) => messageLocale(h?.startsWith("ht") ? "ht" : "fr");
  app.get("/certificate-template", certGuard, async (req) => svc.getTemplate(req));
  app.put("/certificate-template", certGuard, async (req, reply) => {
    await svc.saveTemplate(req, certificateTemplate.parse(req.body));
    return reply.code(204).send();
  });
  app.get("/certificate-template/sample", certGuard, async (req, reply) =>
    reply
      .header("content-type", "application/pdf")
      .header("content-disposition", 'inline; filename="certificat-exemple.pdf"')
      .header("cache-control", "no-store")
      .send(await certificatePdf(await svc.sample(req), locale(req.headers["accept-language"]))),
  );
  app.get("/training/:id/certificate", certGuard, async (req, reply) => {
    const c = await svc.certificate(req, id(req.params));
    const body = await certificatePdf(c, locale(req.headers["accept-language"]));
    return reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `attachment; filename="certificat-${c.number}.pdf"`)
      .header("cache-control", "no-store")
      .send(body);
  });
}
