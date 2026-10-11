import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../plugins/auth.js";
import { ApiError } from "../../plugins/errors.js";
import { authorize, requireFeature } from "../../plugins/tenant.js";
import { createMerchant, listMerchants, merchantCreate, merchantUpdate, updateMerchant } from "./merchants.js";
import type { OnlinePayments } from "./online.js";
import {
  cashPayment,
  checkoutBody,
  idParam,
  paymentsQuery,
  returnParams,
  returnQuery,
  webhookParams,
} from "./schemas.js";
import type { PaymentsService } from "./service.js";

/** FIN-10 et suivants. payments.local est ouvert à tous les paliers. */
export default async function moneyRoutes(
  app: FastifyInstance,
  opts: { payments: PaymentsService; online: OnlinePayments },
) {
  const svc = opts.payments;
  const online = opts.online;
  app.post("/payments/cash", { preHandler: [requireAuth, requireFeature("payments.local")] }, async (req, reply) =>
    reply.code(201).send(await svc.recordCash(req, cashPayment.parse(req.body))),
  );
  app.get("/payments", { preHandler: requireAuth }, async (req) => ({
    payments: await svc.list(req, paymentsQuery.parse(req.query)),
  }));
  app.get(
    "/receipts/:id",
    { preHandler: requireAuth },
    async (req) => (await svc.receipt(req, idParam.parse(req.params).id)).view,
  );
  app.get("/receipts/:id/pdf", { preHandler: requireAuth }, async (req, reply) => {
    const file = await svc.receiptPdf(req, idParam.parse(req.params).id);
    return reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `attachment; filename="${file.filename}"`)
      .header("cache-control", "no-store")
      .send(file.body);
  });

  // FIN-12 : comptes marchands du parti.
  app.get("/merchant-accounts", { preHandler: requireAuth }, async (req) => ({ accounts: await listMerchants(req) }));
  app.post("/merchant-accounts", { preHandler: requireAuth }, async (req, reply) =>
    reply.code(201).send(await createMerchant(req, merchantCreate.parse(req.body))),
  );
  app.patch("/merchant-accounts/:id", { preHandler: requireAuth }, async (req, reply) => {
    await updateMerchant(req, idParam.parse(req.params).id, merchantUpdate.parse(req.body));
    return reply.code(204).send();
  });

  // FIN-01 : paiement mobile par le membre.
  app.post("/payments/checkout", { preHandler: [requireAuth, requireFeature("payments.local")] }, async (req, reply) =>
    reply.code(201).send(await online.checkout(req, checkoutBody.parse(req.body))),
  );
  app.get("/payments/:id/status", { preHandler: requireAuth }, async (req) =>
    online.status(req, idParam.parse(req.params).id),
  );
  app.post("/payments/:id/check", { preHandler: requireAuth }, async (req) => {
    const id = idParam.parse(req.params).id;
    await online.status(req, id); // contrôle d'accès
    return { status: await online.confirm(req.partyId, id) };
  });
  // Retour du navigateur après paiement : simple signal, l'état est relu chez le fournisseur.
  app.get("/payments/return/:partyId/:id", async (req) => {
    const p = returnParams.parse(req.params);
    const q = returnQuery.parse(req.query);
    return { status: await online.confirm(p.partyId, p.id, q.transactionId ? { transactionId: q.transactionId } : {}) };
  });
  app.post("/payments/reconcile", { preHandler: requireAuth }, async (req) => {
    if (!authorize(req, "payments.read")) throw new ApiError(403, "forbidden");
    return online.reconcile(req.partyId);
  });

  // Notifications des fournisseurs : corps brut conservé pour vérifier la signature.
  await app.register(async (hooks) => {
    hooks.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => done(null, body));
    hooks.post(
      "/webhooks/:provider/:partyId",
      { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
      async (req) => {
        const p = webhookParams.parse(req.params);
        return online.notify(p.provider, p.partyId, typeof req.body === "string" ? req.body : "", req.headers);
      },
    );
  });
}
