import { describe, expect, it } from "vitest";
import { formatDayTime, formatTime, fromPartyLocal, toPartyLocal } from "./datetime";

describe("heures à l'heure d'Haïti, sur 12 heures", () => {
  it("affiche toujours AM ou PM", () => {
    expect(formatTime("2026-10-17T13:00:00Z")).toBe("9:00 AM"); // été : UTC−4
    expect(formatTime("2026-10-17T17:30:00Z")).toBe("1:30 PM");
    expect(formatTime("2026-01-10T05:00:00Z")).toBe("12:00 AM"); // hiver : UTC−5, minuit
    expect(formatDayTime("2026-10-17T16:00:00Z")).toBe("17 oct., 12:00 PM");
  });

  it("convertit l'heure saisie en Haïti, heure d'été comprise", () => {
    expect(fromPartyLocal("2026-10-17T09:00")).toBe("2026-10-17T13:00:00.000Z");
    expect(fromPartyLocal("2026-01-10T09:00")).toBe("2026-01-10T14:00:00.000Z");
    expect(fromPartyLocal("pas une date")).toBeUndefined();
  });

  it("préremplit le formulaire avec l'heure d'Haïti, aller et retour", () => {
    expect(toPartyLocal("2026-10-17T13:00:00.000Z")).toBe("2026-10-17T09:00");
    for (const v of ["2026-03-08T01:30", "2026-07-04T18:45", "2026-12-31T23:59"]) {
      expect(toPartyLocal(fromPartyLocal(v))).toBe(v);
    }
  });
});
