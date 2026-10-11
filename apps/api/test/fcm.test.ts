// Adaptateur FCM (HTTP v1) : jeton OAuth signé avec le compte de service, envoi, appareils invalides.
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FcmPushSender } from "../src/lib/messaging/push.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const account = {
  project_id: "civora-test",
  client_email: "push@civora-test.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

describe("FcmPushSender", () => {
  it("obtient un jeton OAuth, envoie à chaque appareil et repère les jetons invalides", async () => {
    const calls: string[] = [];
    let assertion = "";
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push(url);
      if (url.includes("oauth2")) {
        assertion = new URLSearchParams(String(init.body)).get("assertion") ?? "";
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      }
      const token = (JSON.parse(String(init.body)) as { message: { token: string } }).message.token;
      return new Response("{}", { status: token === "gone" ? 404 : 200 });
    }) as unknown as typeof fetch;
    const r = await new FcmPushSender(account, fetchImpl).send(["a", "b", "gone"], { title: "T", body: "B" });
    expect(r).toEqual({ sent: 2, failed: 1, invalidTokens: ["gone"] });
    expect(calls.filter((c) => c.includes("messages:send"))).toHaveLength(3);
    expect(calls[1]).toBe("https://fcm.googleapis.com/v1/projects/civora-test/messages:send");
    const payload = JSON.parse(Buffer.from(assertion.split(".")[1]!, "base64url").toString()) as {
      iss: string;
      scope: string;
    };
    expect(payload).toMatchObject({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    });
  });
});
