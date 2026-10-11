import { describe, expect, it } from "vitest";
import { addMonths, isValidAmount, isValidFixedDueDay, obligationState, schedule } from "../src/dues.js";

const dues = (p: Parameters<typeof schedule>[0]) => schedule(p).map((x) => x.dueDate);

describe("addMonths", () => {
  it("garde le jour et le borne à la fin du mois", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
});

describe("échéances à la date anniversaire (FIN-05)", () => {
  it("annuelle : chaque année à la date d'adhésion", () => {
    expect(dues({ periodicity: "annual", dueRule: "anniversary", start: "2026-03-14", until: "2028-12-31" })).toEqual([
      "2026-03-14",
      "2027-03-14",
      "2028-03-14",
    ]);
  });

  it("mensuelle : ne perd pas le 31 après février", () => {
    expect(dues({ periodicity: "monthly", dueRule: "anniversary", start: "2026-01-31", until: "2026-04-30" })).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("adhésion un 29 février", () => {
    expect(dues({ periodicity: "annual", dueRule: "anniversary", start: "2028-02-29", until: "2030-03-01" })).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
    ]);
  });

  it("trimestrielle et semestrielle", () => {
    expect(
      dues({ periodicity: "quarterly", dueRule: "anniversary", start: "2026-01-10", until: "2026-12-31" }),
    ).toHaveLength(4);
    expect(
      dues({ periodicity: "semiannual", dueRule: "anniversary", start: "2026-01-10", until: "2026-12-31" }),
    ).toEqual(["2026-01-10", "2026-07-10"]);
  });

  it("ponctuelle : une seule fois, à l'adhésion", () => {
    expect(dues({ periodicity: "once", dueRule: "anniversary", start: "2026-05-02", until: "2030-01-01" })).toEqual([
      "2026-05-02",
    ]);
  });

  it("rien avant l'adhésion", () => {
    expect(dues({ periodicity: "annual", dueRule: "anniversary", start: "2026-05-02", until: "2026-01-01" })).toEqual(
      [],
    );
  });
});

describe("échéances à date fixe (FIN-05)", () => {
  it("annuelle au 31 janvier : la période en cours est due dès l'adhésion", () => {
    expect(
      schedule({
        periodicity: "annual",
        dueRule: "fixed",
        fixedDueDay: "01-31",
        start: "2026-06-10",
        until: "2028-02-01",
      }),
    ).toEqual([
      { periodStart: "2026-01-31", dueDate: "2026-06-10" },
      { periodStart: "2027-01-31", dueDate: "2027-01-31" },
      { periodStart: "2028-01-31", dueDate: "2028-01-31" },
    ]);
  });

  it("adhésion le jour même de la date fixe", () => {
    expect(
      dues({ periodicity: "annual", dueRule: "fixed", fixedDueDay: "01-31", start: "2026-01-31", until: "2026-12-31" }),
    ).toEqual(["2026-01-31"]);
  });

  it("adhésion juste avant la date fixe : période précédente due tout de suite", () => {
    expect(
      schedule({
        periodicity: "annual",
        dueRule: "fixed",
        fixedDueDay: "01-31",
        start: "2026-01-15",
        until: "2026-02-15",
      }),
    ).toEqual([
      { periodStart: "2025-01-31", dueDate: "2026-01-15" },
      { periodStart: "2026-01-31", dueDate: "2026-01-31" },
    ]);
  });

  it("mensuelle le 5 de chaque mois", () => {
    expect(
      dues({
        periodicity: "monthly",
        dueRule: "fixed",
        fixedDueDay: "01-05",
        start: "2026-03-20",
        until: "2026-06-05",
      }),
    ).toEqual(["2026-03-20", "2026-04-05", "2026-05-05", "2026-06-05"]);
  });

  it("exige une date MM-JJ valide", () => {
    expect(() =>
      schedule({ periodicity: "annual", dueRule: "fixed", start: "2026-01-01", until: "2027-01-01" }),
    ).toThrow();
    expect(isValidFixedDueDay("02-29")).toBe(true);
    expect(isValidFixedDueDay("02-30")).toBe(false);
    expect(isValidFixedDueDay("13-01")).toBe(false);
  });
});

describe("état d'une échéance", () => {
  const o = { dueDate: "2026-03-01", paidAt: null };
  it("à venir, due, en retard après le délai de grâce, payée", () => {
    expect(obligationState(o, "2026-02-28", 15)).toBe("upcoming");
    expect(obligationState(o, "2026-03-16", 15)).toBe("due");
    expect(obligationState(o, "2026-03-17", 15)).toBe("late");
    expect(obligationState({ ...o, paidAt: "2026-03-20" }, "2026-04-01", 15)).toBe("paid");
  });
});

describe("montants", () => {
  it("accepte des décimales exactes, refuse zéro, les négatifs et les flottants mal formés", () => {
    expect(isValidAmount("500")).toBe(true);
    expect(isValidAmount("1250.50")).toBe(true);
    expect(isValidAmount("0")).toBe(false);
    expect(isValidAmount("0.00")).toBe(false);
    expect(isValidAmount("-5")).toBe(false);
    expect(isValidAmount("10.555")).toBe(false);
    expect(isValidAmount("1e3")).toBe(false);
  });
});
