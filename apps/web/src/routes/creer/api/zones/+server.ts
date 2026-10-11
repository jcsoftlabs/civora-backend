import { json } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import type { RequestHandler } from "./$types";

/** Zones où un membre se localise : section communale en Haïti, pays ou ville de la diaspora. */
const LEVELS = new Set(["section_communale", "diaspora_pays", "diaspora_ville"]);

export const GET: RequestHandler = async ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return json({ zones: [] });
  const res = await api<{ zones: Array<{ code: string; level: string; name: string; nameHt: string | null }> }>(
    `/zones/search?q=${encodeURIComponent(q)}`,
  );
  const zones = res.zones.filter((z) => LEVELS.has(z.level));
  // Contexte lisible : « 1re Section Turgeau, Port-au-Prince ».
  const withContext = await Promise.all(
    zones.slice(0, 8).map(async (z) => {
      const d = await api<{ ancestors: Array<{ name: string; level: string }> }>(
        `/zones/${encodeURIComponent(z.code)}`,
      );
      const parent = d.ancestors.at(-1);
      return { code: z.code, name: z.name, context: parent && parent.level !== "pays" ? parent.name : null };
    }),
  );
  return json({ zones: withContext });
};
