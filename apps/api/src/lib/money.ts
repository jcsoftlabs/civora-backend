/**
 * Montants exacts : chaînes décimales converties en centimes entiers (bigint). Jamais de flottant sur l'argent.
 */
export function toCents(amount: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!m) throw new Error(`montant invalide : ${amount}`);
  return BigInt(m[1]!) * 100n + BigInt((m[2] ?? "").padEnd(2, "0"));
}

export function fromCents(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

export function sum(amounts: string[]): string {
  return fromCents(amounts.reduce((t, a) => t + toCents(a), 0n));
}

/** Affichage : 1 250,50 HTG (séparateurs français). */
export function formatAmount(amount: string, currency: string): string {
  const [int, dec] = fromCents(toCents(amount)).split(".");
  return `${int!.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F")},${dec} ${currency}`;
}
