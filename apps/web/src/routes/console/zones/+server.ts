import { error, json } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import { currentStaff } from "$lib/server/console-session";
import type { RequestHandler } from "./$types";

/** Recherche de la zone du fondateur pour la création manuelle (section communale, ville de la diaspora). */
const LEVELS = new Set(["section_communale", "diaspora_pays", "diaspora_ville"]);

export const GET: RequestHandler = async ({ url, cookies, getClientAddress }) => {
  if (!(await currentStaff(cookies, getClientAddress())))
    error(401, { message: "unauthenticated", code: "unauthenticated" });
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return json({ zones: [] });
  const res = await api<{ zones: Array<{ code: string; level: string; name: string }> }>(
    `/zones/search?q=${encodeURIComponent(q)}`,
  );
  const zones = res.zones.filter((z) => LEVELS.has(z.level)).slice(0, 8);
  const withContext = await Promise.all(
    zones.map(async (z) => {
      const d = await api<{ ancestors: Array<{ name: string; level: string }> }>(
        `/zones/${encodeURIComponent(z.code)}`,
      );
      const parent = d.ancestors.at(-1);
      return { code: z.code, name: z.name, context: parent && parent.level !== "pays" ? parent.name : null };
    }),
  );
  return json({ zones: withContext });
};
