/** Date civile du jour en Haïti (AAAA-MM-JJ) : les échéances suivent le calendrier local, pas l'UTC. */
export function today(timeZone = "America/Port-au-Prince", now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
