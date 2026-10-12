// ADH-10 : périodes d'un cahier de cotisations, échéances de la formule, montants (sans base).
import { describe, expect, it } from "vitest";
import { parseAmount, parsePeriod, periodsFor, periodStartOn } from "../src/modules/members/import/dues-periods.js";

describe("périodes écrites dans le cahier", () => {
  it("un mois", () => {
    for (const v of ["mars 2026", "Mars 2026", "03/2026", "3-2026", "2026-03", "mas 2026", "14/03/2026"])
      expect(parsePeriod(v), v).toEqual(["2026-03"]);
  });
  it("une année, un trimestre, un semestre", () => {
    expect(parsePeriod("2026")).toHaveLength(12);
    expect(parsePeriod("T1 2026")).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(parsePeriod("3e trimestre 2025")).toEqual(["2025-07", "2025-08", "2025-09"]);
    expect(parsePeriod("S2 2025")).toEqual(["2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12"]);
  });
  it("une plage", () => {
    expect(parsePeriod("janvier à juin 2026")).toHaveLength(6);
    expect(parsePeriod("01/2026-06/2026")).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
    expect(parsePeriod("2025-11 au 2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(parsePeriod("novembre à février 2026")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("illisible", () => {
    for (const v of ["", "cotisation", "13/2026", "mars", "2019-01 à 2026-01"]) expect(parsePeriod(v), v).toBeNull();
  });
});

describe("échéances de la formule", () => {
  const monthly = {
    periodicity: "monthly" as const,
    dueRule: "anniversary" as const,
    fixedDueDay: null,
    start: "2026-02-14",
  };
  it("mensuelle à la date anniversaire : l'échéance qui commence dans le mois", () => {
    expect(periodStartOn(monthly, "2026-03-31")).toBe("2026-03-14");
    expect(periodsFor(monthly, ["2025-12", "2026-01", "2026-03"])).toEqual(["2025-12-14", "2026-01-14", "2026-03-14"]);
  });
  it("annuelle : « 2026 » ne compte qu'une échéance", () => {
    const annual = {
      periodicity: "annual" as const,
      dueRule: "anniversary" as const,
      fixedDueDay: null,
      start: "2024-03-14",
    };
    expect(periodsFor(annual, parsePeriod("2026")!)).toEqual(["2026-03-14"]);
    const fixed = {
      periodicity: "annual" as const,
      dueRule: "fixed" as const,
      fixedDueDay: "01-01",
      start: "2026-05-02",
    };
    expect(periodsFor(fixed, parsePeriod("2025")!)).toEqual(["2025-01-01"]);
  });
  it("trimestrielle à date fixe", () => {
    const q = {
      periodicity: "quarterly" as const,
      dueRule: "fixed" as const,
      fixedDueDay: "01-01",
      start: "2026-05-02",
    };
    expect(periodsFor(q, parsePeriod("T1 2026")!)).toEqual(["2026-01-01"]);
    expect(periodsFor(q, parsePeriod("janvier à juin 2026")!)).toEqual(["2026-01-01", "2026-04-01"]);
  });
});

describe("montants", () => {
  it("écritures usuelles", () => {
    expect(parseAmount("1 500")).toBe("1500.00");
    expect(parseAmount("1500,50")).toBe("1500.50");
    expect(parseAmount("1,500.00")).toBe("1500.00");
    expect(parseAmount("HTG 500")).toBe("500.00");
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("gratuit")).toBeNull();
  });
});
