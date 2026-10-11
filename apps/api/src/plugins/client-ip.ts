// Adresse IP réelle de la personne, pour la limitation du débit et le journal d'audit (SEC-09).
// - Appel direct (app mobile) : l'adresse vue par le proxy de l'hébergeur (TRUST_PROXY_HOPS), jamais un
//   X-Forwarded-For choisi par le client.
// - Appel du serveur web SvelteKit : il transmet l'adresse de la personne dans x-civora-client-ip, avec le
//   secret partagé WEB_SERVER_SECRET. Sans ce secret, l'en-tête est ignoré. Sans cela, tout le trafic du site
//   partagerait l'adresse du serveur web et une seule limite de débit.
import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import fp from "fastify-plugin";

// Le type de req.clientIp est déclaré dans plugins/tenant.ts, avec les autres champs de la requête.
export default fp<{ webSecret?: string | undefined }>(async (app, opts) => {
  const secret = opts.webSecret ? Buffer.from(opts.webSecret) : null;
  app.decorateRequest("clientIp", "");
  app.addHook("onRequest", async (req) => {
    req.clientIp = req.ip;
    if (!secret) return;
    const given = req.headers["x-civora-web"];
    const ip = req.headers["x-civora-client-ip"];
    if (typeof given !== "string" || typeof ip !== "string") return;
    const g = Buffer.from(given);
    if (g.length === secret.length && timingSafeEqual(g, secret) && isIP(ip)) req.clientIp = ip;
  });
});
