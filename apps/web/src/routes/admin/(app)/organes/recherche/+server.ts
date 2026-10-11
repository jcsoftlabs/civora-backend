import { error, json } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { RequestHandler } from "./$types";

/**
 * Recherches du panneau des organes, côté serveur (jeton en cookie httpOnly) :
 * - zones où rattacher un organe (département, commune, section, pays ou ville de la diaspora) ;
 * - membres validés à nommer à un poste, dans la zone de la personne (members.read) et celle de l'organe.
 */
export const GET: RequestHandler = async ({ url, cookies, locals, getClientAddress }) => {
  const s = await currentSession(cookies, locals.partySlug!);
  if (!s || s.me.mfaPending) error(401, { message: "unauthorized", code: "unauthorized" });
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return json({ results: [] });
  const ip = getClientAddress();
  // Zone de l'organe : seuls ses membres peuvent y occuper un poste (l'API le vérifie aussi).
  const within = /^[A-Z0-9-]{2,20}$/.test(url.searchParams.get("within") ?? "") ? url.searchParams.get("within") : null;

  if (url.searchParams.get("type") === "zones") {
    const res = await api<{ zones: Array<{ code: string; level: string; name: string }> }>(
      `/zones/search?q=${encodeURIComponent(q)}`,
      { ip },
    );
    const zones = res.zones.filter((z) => z.level !== "pays" && z.level !== "diaspora").slice(0, 8);
    const results = await Promise.all(
      zones.map(async (z) => {
        const d = await api<{ ancestors: Array<{ name: string; level: string }> }>(
          `/zones/${encodeURIComponent(z.code)}`,
          { ip },
        );
        const parent = d.ancestors.at(-1);
        return { id: z.code, label: z.name, context: parent && parent.level !== "pays" ? parent.name : null };
      }),
    );
    return json({ results });
  }

  const res = await api<{
    items: Array<{ id: string; firstName: string; lastName: string; number: string; zoneName: string }>;
  }>(`/members?state=approved&limit=8&q=${encodeURIComponent(q)}${within ? `&zoneCode=${within}` : ""}`, {
    token: s.token,
    ip,
  }).catch(() => ({
    items: [],
  }));
  return json({
    results: res.items.map((m) => ({
      id: m.id,
      label: `${m.firstName} ${m.lastName}`,
      context: `${m.number} · ${m.zoneName}`,
    })),
  });
};
