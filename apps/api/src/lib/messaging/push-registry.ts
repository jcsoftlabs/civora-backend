import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../../config.js";
import { FcmPushSender, LogPushSender, type PushSender } from "./push.js";

/** FCM si un compte de service est configuré ; sinon journal (développement uniquement). */
export function buildPushSender(config: Config, log: FastifyBaseLogger): PushSender {
  if (config.FCM_SERVICE_ACCOUNT) return FcmPushSender.fromEnv(config.FCM_SERVICE_ACCOUNT);
  if (config.NODE_ENV === "production") {
    // Sans FCM, les campagnes restent programmées et s'enverront dès qu'il sera configuré.
    return {
      send: async () => {
        throw new Error("FCM non configuré");
      },
    };
  }
  return new LogPushSender(log);
}
