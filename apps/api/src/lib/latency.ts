// NFR-04 : temps de réponse de l'API sur les 15 dernières minutes (95 % des requêtes sous 500 ms).
// Fenêtre en mémoire par instance, sans aucune donnée de requête : seulement une durée et une heure.

const WINDOW_MS = 15 * 60_000;
const MAX_SAMPLES = 20_000;

export class LatencyWindow {
  private samples: { at: number; ms: number }[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  record(ms: number): void {
    this.samples.push({ at: this.now(), ms });
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
  }

  /** Nombre de requêtes et 95e centile (ms) de la fenêtre ; null tant qu'il n'y a aucune requête. */
  summary(): { requests: number; p95Ms: number | null } {
    const since = this.now() - WINDOW_MS;
    const first = this.samples.findIndex((s) => s.at >= since);
    this.samples = first < 0 ? [] : this.samples.slice(first);
    if (!this.samples.length) return { requests: 0, p95Ms: null };
    const sorted = this.samples.map((s) => s.ms).sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
    return { requests: sorted.length, p95Ms: Math.round(p95) };
  }
}
