/**
 * Échéances de cotisation (FIN-03, FIN-05). Calcul pur, en dates civiles AAAA-MM-JJ (aucun fuseau horaire),
 * partagé par l'API, le futur job nocturne et les écrans.
 *
 * - Anniversaire : la période commence à la date d'adhésion et revient tous les N mois.
 * - Date fixe (MM-JJ) : tous les membres doivent à la même date ; la période en cours à l'adhésion est due
 *   dès l'adhésion.
 * - Fin de mois : le 31 janvier + 1 mois donne le 28 (ou 29) février ; le mois suivant revient au 31 mars.
 */
export const PERIODICITIES = ["monthly", "quarterly", "semiannual", "annual", "once"] as const;
export type Periodicity = (typeof PERIODICITIES)[number];
export type DueRule = "anniversary" | "fixed";

const MONTHS: Record<Exclude<Periodicity, "once">, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

export interface Period {
  /** Début de la période couverte. */
  periodStart: string;
  /** Date à laquelle la cotisation est due. */
  dueDate: string;
}

export interface ScheduleInput {
  periodicity: Periodicity;
  dueRule: DueRule;
  /** MM-JJ, obligatoire pour une date fixe. */
  fixedDueDay?: string | null;
  /** Date d'adhésion (ou de souscription à la formule). */
  start: string;
  /** Dernière date d'échéance à produire (incluse). */
  until: string;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parse(d: string): [number, number, number] {
  const m = DATE.exec(d);
  if (!m) throw new Error(`date invalide : ${d}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Ajoute `months` mois à une date d'ancrage, en gardant le jour d'origine (borné à la fin du mois). */
export function addMonths(anchor: string, months: number): string {
  const [y, m, d] = parse(anchor);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

export function isValidFixedDueDay(v: string): boolean {
  const m = /^(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(2024, month); // 2024 : 29 février admis
}

/** Liste des échéances de `start` à `until` inclus. */
export function schedule(input: ScheduleInput): Period[] {
  const { start, until } = input;
  parse(start);
  parse(until);
  if (until < start) return [];
  if (input.periodicity === "once") return [{ periodStart: start, dueDate: start }];
  const step = MONTHS[input.periodicity];

  let anchor = start;
  if (input.dueRule === "fixed") {
    if (!input.fixedDueDay || !isValidFixedDueDay(input.fixedDueDay)) throw new Error("date fixe MM-JJ requise");
    // Ancre = dernière occurrence de la date fixe (rythme de la formule) au plus tard à l'adhésion.
    const [sy] = parse(start);
    anchor = addMonths(`${sy - 1}-${input.fixedDueDay}`, 0);
    while (addMonths(anchor, step) <= start) anchor = addMonths(anchor, step);
  }

  const out: Period[] = [];
  // On calcule chaque échéance depuis l'ancre (et non de proche en proche) pour ne jamais perdre le 31.
  for (let k = 0; ; k++) {
    const periodStart = addMonths(anchor, k * step);
    const dueDate = periodStart < start ? start : periodStart;
    if (dueDate > until) break;
    out.push({ periodStart, dueDate });
    if (k > 1200) break; // garde-fou : 100 ans de mensualités
  }
  return out;
}

/** État d'une échéance pour l'affichage et les effets du retard (FIN-06). */
export function obligationState(o: { dueDate: string; paidAt: string | null }, today: string, graceDays: number) {
  if (o.paidAt) return "paid" as const;
  if (o.dueDate > today) return "upcoming" as const;
  const [y, m, d] = parse(o.dueDate);
  const limit = new Date(Date.UTC(y, m - 1, d + graceDays)).toISOString().slice(0, 10);
  return today > limit ? ("late" as const) : ("due" as const);
}

/** Montant : chaîne décimale, deux décimales au plus, strictement positive (jamais de flottant). */
export function isValidAmount(v: string): boolean {
  return /^(?!0+(\.0+)?$)\d{1,10}(\.\d{1,2})?$/.test(v);
}
