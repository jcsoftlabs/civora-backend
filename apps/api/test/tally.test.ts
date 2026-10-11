// VOT-06, VOT-07 : dépouillement selon le mode, quorum, seuil, égalités.
import { describe, expect, it } from "vitest";
import { tally, type TallyInput } from "../src/modules/votes/tally.js";

const cands = (...ids: string[]) => ids.map((id, position) => ({ id, position }));
const votes = (spec: Record<string, number>, blank = 0) => [
  ...Object.entries(spec).flatMap(([id, n]) => Array.from({ length: n }, () => ({ candidateIds: [id] }))),
  ...Array.from({ length: blank }, () => ({ blank: true })),
];
const base = (over: Partial<TallyInput>): TallyInput => ({
  method: "simple_majority",
  round: 1,
  seats: 1,
  registered: 100,
  quorumPercent: null,
  validityThresholdPercent: null,
  candidates: cands("a", "b", "c"),
  ballots: [],
  ...over,
});

describe("dépouillement", () => {
  it("majorité simple : le premier l'emporte ; les blancs comptent dans la participation, pas dans les voix", () => {
    const r = tally(base({ ballots: votes({ a: 30, b: 20, c: 10 }, 5) }));
    expect(r).toMatchObject({
      winners: ["a"],
      reason: "elected",
      ballots: 65,
      blank: 5,
      validVotes: 60,
      turnoutPercent: 65,
    });
  });

  it("égalité en tête : personne n'est désigné", () => {
    expect(tally(base({ ballots: votes({ a: 20, b: 20 }) }))).toMatchObject({ winners: [], reason: "tie" });
  });

  it("quorum non atteint : scrutin sans vainqueur", () => {
    const r = tally(base({ quorumPercent: 50, ballots: votes({ a: 30, b: 10 }) }));
    expect(r).toMatchObject({ quorumMet: false, winners: [], reason: "quorum_not_met" });
  });

  it("seuil de validité : le premier doit réunir le pourcentage demandé", () => {
    const r = tally(base({ validityThresholdPercent: 50, ballots: votes({ a: 40, b: 35, c: 25 }) }));
    expect(r.reason).toBe("threshold_not_met");
  });

  it("deux tours : majorité absolue au premier tour, sinon les deux premiers au second", () => {
    expect(tally(base({ method: "two_rounds", ballots: votes({ a: 51, b: 30, c: 19 }) })).winners).toEqual(["a"]);
    const r = tally(base({ method: "two_rounds", ballots: votes({ a: 40, b: 35, c: 25 }) }));
    expect(r).toMatchObject({ reason: "runoff", runoff: ["a", "b"], winners: [] });
    const tie = tally(base({ method: "two_rounds", ballots: votes({ a: 40, b: 30, c: 30 }) }));
    expect(tie.runoff).toEqual(["a", "b", "c"]);
    const second = tally(
      base({ method: "two_rounds", round: 2, candidates: cands("a", "b"), ballots: votes({ a: 45, b: 55 }) }),
    );
    expect(second).toMatchObject({ winners: ["b"], reason: "elected" });
  });

  it("liste : les mieux placés pour les sièges ; égalité au dernier siège signalée", () => {
    const r = tally(
      base({
        method: "list",
        seats: 2,
        candidates: cands("a", "b", "c", "d"),
        ballots: [...votes({ a: 10, b: 8, c: 3 }), { candidateIds: ["a", "b"] }],
      }),
    );
    expect(r).toMatchObject({ winners: ["a", "b"], reason: "elected" });
    const tie = tally(
      base({ method: "list", seats: 2, candidates: cands("a", "b", "c"), ballots: votes({ a: 10, b: 5, c: 5 }) }),
    );
    expect(tie).toMatchObject({ winners: ["a"], reason: "tie" });
  });

  it("oui ou non : la proposition passe à la majorité des votes valables", () => {
    const yesNo = [
      { id: "y", position: 0, yes: true },
      { id: "n", position: 1, yes: false },
    ];
    expect(tally(base({ method: "yes_no", candidates: yesNo, ballots: votes({ y: 30, n: 20 }, 10) })).reason).toBe(
      "elected",
    );
    expect(tally(base({ method: "yes_no", candidates: yesNo, ballots: votes({ y: 20, n: 20 }) })).reason).toBe(
      "rejected",
    );
  });
});
