import { describe, expect, it } from "vitest";
import { partySlugFromHost } from "./party-host";

describe("partySlugFromHost", () => {
  it("lit le slug du sous-domaine, en production et en local", () => {
    expect(partySlugFromHost("horizon.civora.app", "civora.app")).toBe("horizon");
    expect(partySlugFromHost("parti-horizon.localhost:5173", "civora.app")).toBe("parti-horizon");
  });
  it("ignore le site commercial, la console et les hôtes étrangers", () => {
    expect(partySlugFromHost("civora.app", "civora.app")).toBeNull();
    expect(partySlugFromHost("www.civora.app", "civora.app")).toBeNull();
    expect(partySlugFromHost("console.civora.app", "civora.app")).toBeNull();
    expect(partySlugFromHost("horizon.evil.example", "civora.app")).toBeNull();
  });
});
