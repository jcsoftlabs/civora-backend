import type { Handle } from "@sveltejs/kit";
import { env } from "$env/dynamic/public";
import { negotiateLocale } from "$lib/i18n";
import { partySlugFromHost } from "$lib/party-host";

/**
 * Résolution de la surface, du parti et de la langue à partir de la requête (voir apps/web/CLAUDE.md).
 * P2 : interroger l'API (cache court) pour transformer <slug> ou un domaine personnalisé en partyId + thème.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const host = event.url.hostname;
  const root = env.PUBLIC_ROOT_DOMAIN || "civora.app";

  if (host === `console.${root}`) {
    event.locals.surface = "console";
  } else if (host === root || host === `www.${root}` || host === "localhost" || host === "127.0.0.1") {
    // localhost sans sous-domaine : le site commercial en développement.
    event.locals.surface = "marketing";
  } else {
    event.locals.surface = event.url.pathname.startsWith("/admin") ? "admin" : "site";
    event.locals.partyHost = host;
    const slug = partySlugFromHost(event.url.host, root);
    if (slug) event.locals.partySlug = slug;
  }

  event.locals.locale = negotiateLocale(event.cookies.get("lang"), event.request.headers.get("accept-language"));

  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace("%lang%", event.locals.locale),
  });
};
