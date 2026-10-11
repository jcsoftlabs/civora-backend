// VOT-06, VOT-07 : dépouillement d'un tour. Fonction pure, sans base : les bulletins arrivent sans votant.
// Votes valables = bulletins non blancs ; la participation compte aussi les blancs.

export type Method = "simple_majority" | "two_rounds" | "list" | "yes_no";

export interface TallyInput {
  method: Method;
  round: number;
  seats: number;
  registered: number;
  quorumPercent: number | null;
  validityThresholdPercent: number | null;
  /** Candidats ou options en lice pour ce tour, dans l'ordre d'affichage. */
  candidates: Array<{ id: string; position: number; yes?: boolean }>;
  ballots: Array<{ blank?: boolean; candidateIds?: string[] }>;
}

export interface TallyResult {
  counts: Record<string, number>;
  ballots: number;
  blank: number;
  validVotes: number;
  turnoutPercent: number;
  quorumMet: boolean;
  /** Élus (ou l'option adoptée) ; vide si personne ne l'emporte. */
  winners: string[];
  /** Deux tours : qualifiés pour le second tour. */
  runoff: string[] | null;
  /** Pourquoi personne ne l'emporte : quorum, seuil, égalité. */
  reason: "elected" | "runoff" | "quorum_not_met" | "threshold_not_met" | "tie" | "rejected" | "no_votes";
}

const pct = (n: number, total: number) => (total ? (n / total) * 100 : 0);

export function tally(i: TallyInput): TallyResult {
  const counts: Record<string, number> = Object.fromEntries(i.candidates.map((c) => [c.id, 0]));
  let blank = 0;
  for (const b of i.ballots) {
    if (b.blank || !b.candidateIds?.length) {
      blank++;
      continue;
    }
    for (const id of b.candidateIds) if (id in counts) counts[id]! += 1;
  }
  const ballots = i.ballots.length;
  const validVotes = ballots - blank;
  const turnoutPercent = Math.round(pct(ballots, i.registered) * 10) / 10;
  const quorumMet = i.quorumPercent === null || pct(ballots, i.registered) >= i.quorumPercent;
  const base = { counts, ballots, blank, validVotes, turnoutPercent, quorumMet, runoff: null };
  if (!quorumMet) return { ...base, winners: [], reason: "quorum_not_met" };
  if (!validVotes) return { ...base, winners: [], reason: "no_votes" };

  // Classement : voix décroissantes, puis ordre d'affichage (seulement pour départager l'affichage).
  const ranked = [...i.candidates].sort((a, b) => counts[b.id]! - counts[a.id]! || a.position - b.position);
  const threshold = (id: string) =>
    i.validityThresholdPercent === null || pct(counts[id]!, validVotes) >= i.validityThresholdPercent;

  if (i.method === "yes_no") {
    const yes = i.candidates.find((c) => c.yes);
    const no = i.candidates.find((c) => c.yes === false);
    if (!yes || !no) return { ...base, winners: [], reason: "no_votes" };
    // La proposition passe à la majorité des votes valables, et au seuil s'il y en a un.
    const passes = counts[yes.id]! > counts[no.id]! && threshold(yes.id);
    return { ...base, winners: passes ? [yes.id] : [], reason: passes ? "elected" : "rejected" };
  }

  if (i.method === "list") {
    const seats = Math.min(i.seats, ranked.length);
    const elected = ranked.slice(0, seats);
    const last = elected.at(-1);
    const next = ranked[seats];
    // Égalité au dernier siège : personne n'est désigné pour ce siège, le responsable tranche (nouveau vote).
    if (last && next && counts[last.id] === counts[next.id]) {
      const sure = elected.filter((c) => counts[c.id]! > counts[last.id]!).filter((c) => threshold(c.id));
      return { ...base, winners: sure.map((c) => c.id), reason: "tie" };
    }
    const winners = elected.filter((c) => counts[c.id]! > 0 && threshold(c.id)).map((c) => c.id);
    return { ...base, winners, reason: winners.length ? "elected" : "threshold_not_met" };
  }

  const [first, second] = ranked;
  if (!first) return { ...base, winners: [], reason: "no_votes" };
  if (i.method === "two_rounds" && i.round === 1) {
    // Majorité absolue au premier tour ; sinon les deux premiers vont au second tour.
    if (pct(counts[first.id]!, validVotes) > 50 && threshold(first.id))
      return { ...base, winners: [first.id], reason: "elected" };
    if (!second) return { ...base, winners: [], reason: "threshold_not_met" };
    // Égalité pour la deuxième place : tous les ex aequo sont qualifiés.
    const qualified = ranked.filter((c, k) => k < 2 || counts[c.id] === counts[second.id]).map((c) => c.id);
    return { ...base, winners: [], runoff: qualified, reason: "runoff" };
  }
  if (second && counts[first.id] === counts[second.id]) return { ...base, winners: [], reason: "tie" };
  if (!threshold(first.id)) return { ...base, winners: [], reason: "threshold_not_met" };
  return { ...base, winners: [first.id], reason: "elected" };
}
