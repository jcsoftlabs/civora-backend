// ADH-07 : mise en forme des valeurs d'un fichier de membres. Une valeur illisible n'est jamais devinée : elle est
// écartée et signalée (avertissement), le reste de la ligne est importé.

/** « jean PIERRE-louis » → « Jean Pierre-Louis » quand le champ est tout en capitales ou tout en minuscules. */
export function cleanName(value: string): string {
  const v = value.replace(/\s+/g, " ").trim();
  if (v !== v.toUpperCase() && v !== v.toLowerCase()) return v;
  return v.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Nom complet en prénom et nom : le mot en capitales est le nom (« PIERRE Jean » ou « Jean PIERRE ») ; sinon le
 * dernier mot est le nom.
 */
export function splitFullName(value: string): { firstName: string; lastName: string } | null {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length < 2) return null;
  const caps = words.filter((w) => /\p{L}{2,}/u.test(w) && w === w.toUpperCase());
  if (caps.length && caps.length < words.length) {
    return {
      firstName: cleanName(words.filter((w) => !caps.includes(w)).join(" ")),
      lastName: cleanName(caps.join(" ")),
    };
  }
  return { firstName: cleanName(words.slice(0, -1).join(" ")), lastName: cleanName(words.at(-1)!) };
}

/**
 * Téléphone au format international : 8 chiffres = Haïti (+509), 10 chiffres ou 1 + 10 chiffres = Amérique du
 * Nord (+1), « 00 » = « + ». Sinon : null (numéro écarté et signalé).
 */
export function normalizePhone(value: string): string | null {
  let v = value.replace(/[\s.\-()/]/g, "");
  if (!v) return null;
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  if (v.startsWith("+")) return /^\+\d{8,15}$/.test(v) ? v : null;
  if (!/^\d+$/.test(v)) return null;
  if (v.length === 8) return `+509${v}`;
  if (v.length === 11 && v.startsWith("509")) return `+${v}`;
  if (v.length === 10 && /^[2-9]/.test(v)) return `+1${v}`;
  if (v.length === 11 && v.startsWith("1")) return `+${v}`;
  return null;
}

export function normalizeEmail(value: string): string | null {
  const v = value
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, "");
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(v) && v.length <= 254 ? v : null;
}

const iso = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date.toISOString().slice(0, 10)
    : null;
};

/**
 * Date en AAAA-MM-JJ : « 2026-03-14 », « 14/03/2026 », « 14-3-26 », numéro de série Excel. Jour avant le mois
 * (usage haïtien), sauf quand le jour ne peut pas être un mois (« 03/14/2026 » : fichier de la diaspora).
 */
export function normalizeDate(value: string, opts: { min?: string; max?: string } = {}): string | null {
  const v = value.trim();
  let out: string | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v))) out = iso(+m[1]!, +m[2]!, +m[3]!);
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v))) {
    let [a, b] = [+m[1]!, +m[2]!];
    let y = +m[3]!;
    if (m[3]!.length === 2) y += y > (new Date().getUTCFullYear() % 100) + 1 ? 1900 : 2000;
    if (b > 12 && a <= 12) [a, b] = [b, a];
    out = iso(y, b, a);
  } else if (/^\d{5}$/.test(v)) {
    // Numéro de série Excel (jours depuis le 30 décembre 1899).
    out = new Date(Date.UTC(1899, 11, 30) + +v * 86_400_000).toISOString().slice(0, 10);
  }
  if (!out) return null;
  if ((opts.min && out < opts.min) || (opts.max && out > opts.max)) return null;
  return out;
}

/** « jeunes, Diaspora ; femmes » → ["jeunes", "diaspora", "femmes"], 10 étiquettes de 40 caractères au plus. */
export function splitTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,;|]/)
        .map((t) => t.trim().toLowerCase().slice(0, 40))
        .filter(Boolean),
    ),
  ].slice(0, 10);
}
