import { describe, expect, it } from "vitest";
import { partySlugFromHost } from "./party-host";

describe("partySlugFromHost", () => {
  it("lit le slug du sous-domaine, en production et en local", () => {
    expect(partySlugFromHost("horizon.civora.space", "civora.space")).toBe("horizon");
    expect(partySlugFromHost("parti-horizon.localhost:5173", "civora.space")).toBe("parti-horizon");
  });
  it("ignore le site commercial, la console et les hôtes étrangers", () => {
    expect(partySlugFromHost("civora.space", "civora.space")).toBeNull();
    expect(partySlugFromHost("www.civora.space", "civora.space")).toBeNull();
    expect(partySlugFromHost("console.civora.space", "civora.space")).toBeNull();
    expect(partySlugFromHost("horizon.evil.example", "civora.space")).toBeNull();
  });
});
