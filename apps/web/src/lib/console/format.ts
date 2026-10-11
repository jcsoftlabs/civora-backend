// Mise en forme des chiffres de la console (SOC-10).
const clean = (s: string) => s.replace(/[\u202f\u00a0]/g, " ");
const nf = (digits = 0) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits });

export const num = (n: number) => clean(nf().format(Math.round(n)));

export function money(n: number, currency: string, digits = currency === "HTG" ? 0 : 2) {
  return clean(
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n),
  );
}

export function bytes(n: number) {
  if (n < 1024 ** 2) return `${num(n / 1024)} Ko`;
  if (n < 1024 ** 3) return `${clean(nf(1).format(n / 1024 ** 2))} Mo`;
  return `${clean(nf(2).format(n / 1024 ** 3))} Go`;
}
