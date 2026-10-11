import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../plugins/auth.js";
import { requireFeature } from "../../plugins/tenant.js";
import { cashPayment, idParam, paymentsQuery } from "./schemas.js";
import type { PaymentsService } from "./service.js";

/** FIN-10 et suivants. payments.local est ouvert à tous les paliers. */
export default async function moneyRoutes(app: FastifyInstance, opts: { payments: PaymentsService }) {
  const svc = opts.payments;
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
}
