/**
 * Slug du parti à partir de l'hôte : <slug>.civora.space en production, <slug>.localhost en développement.
 * null pour le site commercial, la console ou un hôte inconnu (domaines personnalisés : SOC-04, plus tard).
 */
export function partySlugFromHost(host: string, root: string): string | null {
  const h = host.toLowerCase().split(":")[0] ?? "";
  for (const suffix of [`.${root}`, ".localhost"]) {
    if (h.endsWith(suffix)) {
      const slug = h.slice(0, -suffix.length);
      if (/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) && slug !== "www" && slug !== "console") return slug;
    }
  }
  return null;
}
