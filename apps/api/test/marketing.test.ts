// SOC-12 : demande de démonstration du site commercial, envoyée par e-mail, jamais stockée.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { LogEmailSender } from "../src/lib/messaging/email.js";

const email = new LogEmailSender();
let app: Awaited<ReturnType<typeof buildApp>>;
const send = (payload: object, ip = "203.0.113.7") =>
  app.inject({ method: "POST", url: "/public/demo-requests", payload, remoteAddress: ip });
const valid = {
  name: "Rose Michel",
  organization: "Association des jeunes de Jacmel",
  kind: "association",
  size: "s",
  phone: "+509 3712 3456",
  message: "Nous voulons voir les cotisations.",
};

beforeAll(async () => {
  app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", SALES_EMAIL: "ventes@example.test" }), {
    email,
  });
  await app.ready();
});
afterAll(() => app.close());

describe("demande de démonstration", () => {
  it("part par e-mail à l'équipe commerciale", async () => {
    const res = await send(valid);
    expect(res.statusCode).toBe(202);
    const m = email.sent.at(-1)!;
    expect(m.to).toBe("ventes@example.test");
    expect(m.subject).toContain("Association des jeunes de Jacmel");
    expect(m.text).toContain("+509 3712 3456");
  });

  it("demande un téléphone ou un e-mail", async () => {
    const res = await send({ ...valid, phone: "" }, "203.0.113.8");
    expect(res.json()).toMatchObject({ code: "contact_required" });
  });

  it("un robot qui remplit le champ piège ne déclenche aucun envoi", async () => {
    const before = email.sent.length;
    expect((await send({ ...valid, website: "http://spam.example" }, "203.0.113.9")).statusCode).toBe(202);
    expect(email.sent.length).toBe(before);
  });

  it("limite les envois par adresse", async () => {
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await send(valid, "203.0.113.10")).statusCode);
    expect(codes.at(-1)).toBe(429);
  });
});
