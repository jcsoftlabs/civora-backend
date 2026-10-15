import { error, redirect, type Handle } from "@sveltejs/kit";
import { env } from "$env/dynamic/public";
import { negotiateLocale } from "$lib/i18n";
import { partySlugFromHost } from "$lib/party-host";

/**
 * Résolution de la surface, du parti et de la langue à partir de la requête (voir apps/web/CLAUDE.md).
 * P2 : interroger l'API (cache court) pour transformer <slug> ou un domaine personnalisé en partyId + thème.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const host = event.url.hostname;
  const root = env.PUBLIC_ROOT_DOMAIN || "civora.space";

  if (host === `console.${root}` || host === "console.localhost") {
    event.locals.surface = "console";
    // La console vit sous /console ; l'adresse nue y mène.
    if (event.url.pathname === "/") redirect(307, "/console");
    if (!event.url.pathname.startsWith("/console") && event.url.pathname !== "/langue")
      error(404, { message: "not_found", code: "not_found" });
  } else if (
    host === root ||
    host === `www.${root}` ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".vercel.app")
  ) {
    // localhost sans sous-domaine : le site commercial en développement. Adresse Vercel (*.vercel.app, avant le
    // domaine ou pour un aperçu) : le site commercial aussi, aucune organisation n'y a d'espace.
    event.locals.surface = "marketing";
  } else {
    event.locals.surface = event.url.pathname.startsWith("/admin") ? "admin" : "site";
    event.locals.partyHost = host;
    const slug = partySlugFromHost(event.url.host, root);
    if (slug) event.locals.partySlug = slug;
  }

  // Les écrans de la console n'existent que sur son adresse.
  if (event.url.pathname.startsWith("/console") && event.locals.surface !== "console")
    error(404, { message: "not_found", code: "not_found" });

  event.locals.locale = negotiateLocale(event.cookies.get("lang"), event.request.headers.get("accept-language"));

  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace("%lang%", event.locals.locale),
  });
};
