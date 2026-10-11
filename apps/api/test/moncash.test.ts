// Adaptateur MonCash : forme des requêtes et lecture des réponses selon la documentation publique.
// À compléter par un essai réel avec la sandbox du parti.
import { describe, expect, it } from "vitest";
import { MonCashProvider } from "../src/lib/payments/moncash.js";

function fakeFetch(routes: Record<string, unknown>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const path = Object.keys(routes).find((p) => url.endsWith(p));
    if (!path) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[path]), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const creds = { clientId: "id-test", clientSecret: "secret-test", mode: "sandbox" };

describe("MonCash", () => {
  it("obtient un jeton avec les identifiants du parti, puis crée le paiement avec notre identifiant de commande", async () => {
    const f = fakeFetch({
      "/Api/oauth/token": { access_token: "tok" },
      "/Api/v1/CreatePayment": { payment_token: { token: "abc" } },
    });
    const c = await new MonCashProvider(f.impl).createCheckout(creds, {
      orderId: "order-1",
      amount: "250.00",
      currency: "HTG",
      returnUrl: "x",
    });
    expect(c.redirectUrl).toBe(
      "https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware/Payment/Redirect?token=abc",
    );
    expect(String((f.calls[0]!.init.headers as Record<string, string>).authorization)).toBe(
      `Basic ${Buffer.from("id-test:secret-test").toString("base64")}`,
    );
    expect(JSON.parse(String(f.calls[1]!.init.body))).toEqual({ amount: 250, orderId: "order-1" });
  });

  it("lit un paiement réussi et son montant", async () => {
    const f = fakeFetch({
      "/Api/oauth/token": { access_token: "tok" },
      "/Api/v1/RetrieveTransactionPayment": {
        payment: { reference: "order-1", transaction_id: "T9", cost: 250, message: "successful" },
      },
    });
    expect(await new MonCashProvider(f.impl).verify(creds, { transactionId: "T9" })).toEqual({
      orderId: "order-1",
      providerRef: "T9",
      status: "succeeded",
      amount: "250.00",
    });
  });

  it("considère comme en attente un paiement introuvable ou une API indisponible", async () => {
    const f = fakeFetch({ "/Api/oauth/token": { access_token: "tok" } });
    expect((await new MonCashProvider(f.impl).verify(creds, { orderId: "order-2" })).status).toBe("pending");
  });

  it("passe en production avec le mode live", async () => {
    const f = fakeFetch({
      "/Api/oauth/token": { access_token: "tok" },
      "/Api/v1/CreatePayment": { payment_token: { token: "z" } },
    });
    const c = await new MonCashProvider(f.impl).createCheckout(
      { ...creds, mode: "live" },
      { orderId: "o", amount: "1", currency: "HTG", returnUrl: "x" },
    );
    expect(c.redirectUrl.startsWith("https://moncashbutton.digicelgroup.com/")).toBe(true);
  });
});
