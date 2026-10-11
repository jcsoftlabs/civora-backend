import { describe, expect, it } from "vitest";
import { PERMISSION_GROUPS, PERMISSIONS } from "../src/permissions.js";

describe("groupes de permissions", () => {
  it("couvrent chaque permission exactement une fois", () => {
    const grouped = Object.values(PERMISSION_GROUPS).flat();
    expect([...grouped].sort()).toEqual([...PERMISSIONS].sort());
  });
});
