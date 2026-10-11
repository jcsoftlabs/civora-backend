import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LocalStorage } from "../../lib/storage/local.js";
import { requireAuth } from "../../plugins/auth.js";
import { ApiError } from "../../plugins/errors.js";
import { type FilesService, uploadRequest } from "./service.js";

const idParam = z.object({ id: z.string().uuid() });

export default async function fileRoutes(app: FastifyInstance, opts: { files: FilesService }) {
  const svc = opts.files;
  const auth = { preHandler: requireAuth };

  app.post(
    "/files/uploads",
    {
      ...auth,
      config: { rateLimit: { max: 60, timeWindow: "1 hour", keyGenerator: (r) => r.auth?.sessionId ?? r.clientIp } },
    },
    async (req, reply) => reply.code(201).send(await svc.requestUpload(req, uploadRequest.parse(req.body))),
  );
  app.post("/files/:id/complete", auth, async (req) => svc.complete(req, idParam.parse(req.params).id));
  app.get("/files/:id/url", auth, async (req) => svc.downloadUrl(req, idParam.parse(req.params).id));
  app.put("/members/me/photo", auth, async (req, reply) => {
    await svc.setMyPhoto(req, z.object({ fileId: z.string().uuid() }).parse(req.body).fileId);
    return reply.code(204).send();
  });

  // Stockage local (développement) : imite les URL signées de R2. N'existe pas quand R2 est configuré.
  if (svc.storage instanceof LocalStorage) {
    const local = svc.storage;
    const q = z.object({ exp: z.coerce.number(), sig: z.string().regex(/^[0-9a-f]{64}$/) });
    await app.register(async (scope) => {
      scope.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: 110 * 1024 * 1024 }, (_r, body, done) =>
        done(null, body),
      );
      scope.put("/storage/local/:key", { bodyLimit: 110 * 1024 * 1024 }, async (req, reply) => {
        const key = decodeURIComponent((req.params as { key: string }).key);
        const { exp, sig } = q.parse(req.query);
        const type = String(req.headers["content-type"] ?? "");
        if (!local.verify("PUT", key, exp, sig, type)) throw new ApiError(403, "signature_invalid");
        await local.put(key, req.body as Buffer, type);
        return reply.code(200).send();
      });
      scope.get("/storage/local/:key", async (req, reply) => {
        const key = decodeURIComponent((req.params as { key: string }).key);
        const { exp, sig } = q.parse(req.query);
        if (!local.verify("GET", key, exp, sig)) throw new ApiError(403, "signature_invalid");
        const obj = await local.read(key);
        if (!obj) throw new ApiError(404, "not_found");
        return reply
          .header("content-type", obj.contentType)
          .header("cache-control", "private, no-store")
          .send(obj.body);
      });
    });
  }
}
