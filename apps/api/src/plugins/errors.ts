import fp from "fastify-plugin";
import type { FastifyError } from "fastify";
import { ZodError } from "zod";

/**
 * Erreurs renvoyées au client : code stable et traduisible, jamais de détail technique ni de donnée personnelle.
 * Le détail reste dans les journaux, rattaché à l'identifiant de requête.
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

export default fp(async (app) => {
  app.setNotFoundHandler((req, reply) => reply.code(404).send({ code: "not_found", requestId: req.id }));

  app.setErrorHandler((err: FastifyError | ApiError | ZodError, req, reply) => {
    if (err instanceof ApiError) {
      // Détail public facultatif (palier requis pour une option verrouillée).
      const extra = "requiredTier" in err ? { requiredTier: (err as { requiredTier: unknown }).requiredTier } : {};
      return reply.code(err.statusCode).send({ code: err.code, ...extra, requestId: req.id });
    }
    if (err instanceof ZodError || ("validation" in err && err.validation)) {
      return reply.code(400).send({ code: "invalid_request", requestId: req.id });
    }
    const status = "statusCode" in err && err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 429) return reply.code(429).send({ code: "rate_limited", requestId: req.id });
    if (status >= 500) req.log.error({ err }, "erreur interne");
    return reply.code(status).send({ code: status >= 500 ? "internal_error" : "request_error", requestId: req.id });
  });
});
