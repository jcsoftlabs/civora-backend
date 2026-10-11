/** Audience saisie dans les formulaires (champs répétés), au format attendu par l'API ; null = tout le parti. */
export function audienceFrom(f: FormData) {
  const list = (k: string) => [...new Set(f.getAll(k).map(String).filter(Boolean))];
  const zoneCodes = list("zoneCodes").filter((c) => /^[A-Z0-9-]{2,20}$/.test(c));
  const statusIds = list("statusIds");
  const organIds = list("organIds");
  const place = String(f.get("diaspora") ?? "");
  const a = {
    ...(zoneCodes.length ? { zoneCodes } : {}),
    ...(statusIds.length ? { statusIds } : {}),
    ...(organIds.length ? { organIds } : {}),
    ...(place === "true" || place === "false" ? { diaspora: place === "true" } : {}),
  };
  return Object.keys(a).length ? a : null;
}

export interface StoredAudience {
  zoneCodes?: string[];
  statusIds?: string[];
  organIds?: string[];
  diaspora?: boolean;
}
