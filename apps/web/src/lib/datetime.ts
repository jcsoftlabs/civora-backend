// Heures de civora : toujours sur 12 heures avec AM ou PM, à l'heure d'Haïti (America/Port-au-Prince, heure
// d'été comprise). Le rendu serveur tourne en UTC : le fuseau est donc toujours donné explicitement.
// L'heure est composée ici à partir des valeurs numériques, et non par Intl : selon la version d'ICU (Node,
// navigateur), le format français sur 12 heures varie. Le résultat est ainsi identique partout.

export const PARTY_TIME_ZONE = "America/Port-au-Prince";

const NUMERIC = new Intl.DateTimeFormat("en-CA", {
  timeZone: PARTY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Année, mois, jour, heure (0 à 23) et minute à l'heure d'Haïti. */
function parts(d: Date | string) {
  const p = Object.fromEntries(NUMERIC.formatToParts(new Date(d)).map((x) => [x.type, x.value]));
  return { year: +p.year!, month: +p.month!, day: +p.day!, hour: +p.hour! % 24, minute: +p.minute! };
}

const MONTH_SHORT = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });
const MONTH_LONG = new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" });
const monthName = (fmt: Intl.DateTimeFormat, month: number) => fmt.format(new Date(Date.UTC(2024, month - 1, 15)));

/** « 9:00 AM », « 12:30 PM », « 12:00 AM » (minuit). */
export function formatTime(d: Date | string): string {
  const { hour, minute } = parts(d);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}
/** « 17 oct., 9:00 AM » */
export function formatDayTime(d: Date | string): string {
  const p = parts(d);
  return `${p.day} ${monthName(MONTH_SHORT, p.month)}, ${formatTime(d)}`;
}
/** « 17 octobre 2026 à 9:00 AM » */
export function formatDateTime(d: Date | string): string {
  const p = parts(d);
  return `${p.day} ${monthName(MONTH_LONG, p.month)} ${p.year} à ${formatTime(d)}`;
}

/**
 * Dates sans heure à l'heure d'Haïti (un soir en Haïti est déjà le lendemain en UTC) : jour, mois, année,
 * jour de la semaine. Pour une heure, utiliser formatTime, formatDayTime ou formatDateTime.
 */
export const partyFormat = (opts: Omit<Intl.DateTimeFormatOptions, "hour" | "minute" | "second">) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: PARTY_TIME_ZONE, ...opts });

/** Décalage d'Haïti à cet instant, en minutes (−300 l'hiver, −240 l'été). */
function offsetMinutes(at: Date): number {
  const p = parts(at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** Heure locale d'Haïti « AAAA-MM-JJTHH:mm » (24 h, valeur de formulaire) vers un instant ISO. */
export function fromPartyLocal(value: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return undefined;
  const naive = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  // Deux passes : le décalage dépend de la date (heure d'été).
  let utc = naive - offsetMinutes(new Date(naive)) * 60_000;
  utc = naive - offsetMinutes(new Date(utc)) * 60_000;
  return new Date(utc).toISOString();
}

/** Instant vers l'heure locale d'Haïti « AAAA-MM-JJTHH:mm » (24 h), pour préremplir un formulaire. */
export function toPartyLocal(d: Date | string | null | undefined): string {
  if (!d) return "";
  const p = parts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
