/**
 * Contrôle des origines (SEC-08), partagé par CORS (REST) et par le WebSocket (temps réel).
 * Correspondance exacte uniquement : pas de jokers, pas de sous-chaînes.
 */
export function isAllowedOrigin(origin: string | undefined, allowed: readonly string[]): boolean {
  if (!origin) return false;
  return allowed.includes(origin);
}
