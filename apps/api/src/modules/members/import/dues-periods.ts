// ADH-10 : lecture des périodes d'un cahier de cotisations et rattachement aux échéances de la formule du membre.
// « mars 2026 », « 03/2026 », « 2026-03 », « 2026 », « T1 2026 », « S2 2025 », « janvier à juin 2026 »,
// « 01/2026-06/2026 » donnent la liste des mois couverts ; chaque mois va ensuite à l'échéance de la formule
// (date fixe ou anniversaire), calculée sur le même calendrier que les échéances générées par civora.
import { addMonths, type Periodicity } from "@civora/shared";
import { plain } from "./fields.js";

/** Mois couvert, « AAAA-MM ». */
export type Month = string;

const MONTH_NAMES: Record<string, number> = {};
const NAMES: [number, string[]][] = [
  [1, ["janvier", "janv", "jan", "january", "janvye"]],
  [2, ["fevrier", "fevr", "fev", "february", "feb", "fevriye"]],
  [3, ["mars", "mar", "march", "mas"]],
  [4, ["avril", "avr", "april", "apr"]],
  [5, ["mai", "may", "me"]],
  [6, ["juin", "june", "jun", "jen"]],
  [7, ["juillet", "juil", "july", "jul", "jiye"]],
  [8, ["aout", "august", "aug", "out"]],
  [9, ["septembre", "sept", "sep", "september", "septanm"]],
  [10, ["octobre", "oct", "october", "oktob"]],
  [11, ["novembre", "nov", "november", "novanm"]],
  [12, ["decembre", "dec", "december", "desanm"]],
];
for (const [n, names] of NAMES) for (const name of names) MONTH_NAMES[name] = n;
const NAME_RE = Object.keys(MONTH_NAMES)
  .sort((a, b) => b.length - a.length)
  .join("|");

const pad = (n: number) => String(n).padStart(2, "0");
const month = (y: number, m: number): Month => `${y}-${pad(m)}`;
const MAX_MONTHS = 36;

/** Mois de `from` à `to` inclus (au plus 36). */
function range(from: [number, number], to: [number, number]): Month[] | null {
  const a = from[0] * 12 + from[1] - 1;
  const b = to[0] * 12 + to[1] - 1;
  if (b < a || b - a >= MAX_MONTHS) return null;
  return Array.from({ length: b - a + 1 }, (_, i) => month(Math.floor((a + i) / 12), ((a + i) % 12) + 1));
}

const validYear = (y: number) => y >= 1950 && y <= 2100;

/** Mois couverts par une période écrite dans le fichier, ou null si elle ne se lit pas. */
export function parsePeriod(value: string): Month[] | null {
  const v = plain(value);
  if (!v) return null;
  let m: RegExpExecArray | null;
  // Année entière.
  if ((m = /^(\d{4})$/.exec(v))) return validYear(+m[1]!) ? range([+m[1]!, 1], [+m[1]!, 12]) : null;
  // Trimestre : « T1 2026 », « Q2 2026 », « 3e trimestre 2026 ».
  if (
    (m = /^(?:t|q)\s?([1-4])\s+(\d{4})$/.exec(v)) ||
    (m = /^([1-4])\s?(?:er|re|e|eme)?\s+trimestre\s+(\d{4})$/.exec(v))
  ) {
    const q = +m[1]!;
    const y = +m[2]!;
    return validYear(y) ? range([y, q * 3 - 2], [y, q * 3]) : null;
  }
  // Semestre : « S1 2026 », « 2e semestre 2026 ».
  if ((m = /^s\s?([12])\s+(\d{4})$/.exec(v)) || (m = /^([12])\s?(?:er|re|e|eme)?\s+semestre\s+(\d{4})$/.exec(v))) {
    const s = +m[1]!;
    const y = +m[2]!;
    return validYear(y) ? range([y, s * 6 - 5], [y, s * 6]) : null;
  }
  // Mois cités dans l'ordre : par leur nom (avec ou sans année), « 2026 03 » (ISO) ou « 03 2026 ».
  const refs: { m: number; y: number | null }[] = [];
  const re = new RegExp(
    `(\\d{4})\\s(\\d{1,2})(?!\\d)|(?<!\\d)(\\d{1,2})\\s(\\d{4})|\\b(${NAME_RE})\\b(?:\\s(\\d{4}))?`,
    "g",
  );
  // `plain` remplace « / », « - » et « . » par des espaces : « 03/2026 » devient « 03 2026 ».
  const text = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/g, "$2 $3") // date complète JJ/MM/AAAA : son mois
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  while ((m = re.exec(text))) {
    if (m[1]) refs.push({ y: +m[1], m: +m[2]! });
    else if (m[3]) refs.push({ m: +m[3], y: +m[4]! });
    else refs.push({ m: MONTH_NAMES[m[5]!]!, y: m[6] ? +m[6] : null });
  }
  if (!refs.length || refs.length > 2 || refs.some((r) => r.m < 1 || r.m > 12)) return null;
  const last = refs.at(-1)!;
  const yearOf = (r: { y: number | null }) => r.y ?? last.y;
  if (refs.length === 1) {
    const y = yearOf(refs[0]!);
    return y && validYear(y) ? [month(y, refs[0]!.m)] : null;
  }
  const [a, b] = refs as [(typeof refs)[0], (typeof refs)[0]];
  const yb = yearOf(b);
  if (!yb || !validYear(yb)) return null;
  // « novembre à février 2026 » : novembre de l'année précédente.
  let ya = a.y ?? yb;
  if (a.y === null && a.m > b.m) ya = yb - 1;
  return range([ya, a.m], [yb, b.m]);
}

const STEP: Record<Exclude<Periodicity, "once">, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

export interface PlanCalendar {
  periodicity: Periodicity;
  dueRule: "anniversary" | "fixed";
  fixedDueDay: string | null;
  /** Début de la souscription du membre (anniversaire), sinon sa date d'adhésion. */
  start: string;
}

/** Dernier début d'échéance au plus tard à `date`, sur le calendrier de la formule. */
export function periodStartOn(cal: PlanCalendar, date: string): string {
  const step = cal.periodicity === "once" ? 1200 : STEP[cal.periodicity];
  const base = cal.dueRule === "fixed" && cal.fixedDueDay ? `${cal.start.slice(0, 4)}-${cal.fixedDueDay}` : cal.start;
  const months =
    (Number(date.slice(0, 4)) - Number(base.slice(0, 4))) * 12 + Number(date.slice(5, 7)) - Number(base.slice(5, 7));
  let k = Math.floor(months / step);
  while (addMonths(base, k * step) > date) k--;
  while (addMonths(base, (k + 1) * step) <= date) k++;
  return addMonths(base, k * step);
}

const lastDay = (m: Month) => {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return `${m}-${pad(new Date(Date.UTC(y, mo, 0)).getUTCDate())}`;
};

/**
 * Échéances couvertes par des mois payés. Mensuelle : l'échéance qui commence dans le mois. Plus longue : les
 * échéances dont au moins la moitié des mois est couverte (« 2026 » sur une annuelle qui commence en mars ne
 * compte qu'une échéance), à défaut la plus couverte.
 */
export function periodsFor(cal: PlanCalendar, months: Month[]): string[] {
  if (cal.periodicity === "monthly") return [...new Set(months.map((m) => periodStartOn(cal, lastDay(m))))].sort();
  const step = cal.periodicity === "once" ? 1 : STEP[cal.periodicity];
  const hits = new Map<string, number>();
  for (const m of months) {
    const start = periodStartOn(cal, `${m}-15`);
    hits.set(start, (hits.get(start) ?? 0) + 1);
  }
  const kept = [...hits].filter(([, n]) => n * 2 >= step).map(([s]) => s);
  if (kept.length) return kept.sort();
  return [[...hits].sort((a, b) => b[1] - a[1])[0]![0]];
}

/** Montant écrit dans un cahier : « 1 500 », « 1500,00 », « 1,500.50 », « HTG 500 » → « 1500.00 ». */
export function parseAmount(value: string): string | null {
  let v = value.replace(/[^\d.,]/g, "");
  if (!v) return null;
  // Le dernier séparateur suivi d'un ou deux chiffres est la virgule décimale ; les autres groupent les milliers.
  const m = /^(.*?)[.,](\d{1,2})$/.exec(v);
  v = m ? `${m[1]!.replace(/[.,]/g, "")}.${m[2]}` : v.replace(/[.,]/g, "");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(v) || Number(v) <= 0) return null;
  return Number(v).toFixed(2);
}
