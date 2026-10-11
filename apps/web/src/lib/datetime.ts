// Heures de civora : toujours sur 12 heures avec AM ou PM, à l'heure d'Haïti (America/Port-au-Prince, heure
// d'été comprise). Le rendu serveur tourne en UTC : le fuseau est donc toujours donné explicitement.

export const PARTY_TIME_ZONE = "America/Port-au-Prince";

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: PARTY_TIME_ZONE, ...opts });

const TIME = fmt({ hour: "numeric", minute: "2-digit", hour12: true });
const DAY_TIME = fmt({ day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const FULL = fmt({ day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

/** « 9:00 AM » */
export const formatTime = (d: Date | string) => TIME.format(new Date(d));
/** « 17 oct., 9:00 AM » */
export const formatDayTime = (d: Date | string) => DAY_TIME.format(new Date(d));
/** « 17 octobre 2026 à 9:00 AM » */
export const formatDateTime = (d: Date | string) => FULL.format(new Date(d));

/** Décalage d'Haïti à cet instant, en minutes (−300 l'hiver, −240 l'été). */
function offsetMinutes(at: Date): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: PARTY_TIME_ZONE, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
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
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: PARTY_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(d))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Format libre à l'heure d'Haïti (dates seules comprises : un soir en Haïti est déjà le lendemain en UTC). */
export const partyFormat = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: PARTY_TIME_ZONE, ...(opts.hour ? { hour12: true } : {}), ...opts });
