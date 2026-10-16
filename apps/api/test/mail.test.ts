import { describe, expect, it } from "vitest";
import { formatFrom } from "../src/lib/messaging/email.js";
import { PLATFORM_BRAND, composeMail, onColor, renderMail, type Brand } from "../src/lib/messaging/mail.js";
import { OTP_MESSAGES, RECEIPT_MESSAGES } from "../src/lib/messaging/templates.js";

const party: Brand = { kind: "party", name: "Parti Horizon", color: "#7A2E5C" };
const site = "https://civora.space";

describe("e-mails aux couleurs du parti", () => {
  it("met le code en avant et garde une version texte lisible", () => {
    const { html, text } = renderMail(OTP_MESSAGES.fr.body.login("Parti Horizon", "482915"), party, "fr", site);
    expect(html).toContain("482915");
    expect(html).toContain("#7A2E5C");
    expect(html).toContain("Message envoyé par Parti Horizon avec civora.");
    expect(text).toMatch(/Votre code : 482915\n/);
    expect(text).toContain("Il expire dans 10 minutes.");
    expect(html).not.toContain("—");
  });

  it("échappe tout texte venu des données", () => {
    const evil: Brand = { kind: "party", name: '<img src=x onerror="alert(1)">', color: "#0F6E66" };
    const { html } = renderMail(OTP_MESSAGES.fr.body.login(evil.name, "000000"), evil, "fr", site);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("ne rend cliquables que les liens web", () => {
    const body = { preheader: "", heading: "Test", paragraphs: [], action: { label: "Ouvrir", url: "javascript:alert(1)" } };
    const { html, text } = renderMail(body, party, "fr", site);
    expect(html).not.toContain("javascript:");
    expect(text).not.toContain("javascript:");
  });

  it("choisit un texte lisible sur la couleur du parti et refuse une couleur invalide", () => {
    expect(onColor("#0F6E66")).toBe("#FFFFFF");
    expect(onColor("#F2B84B")).toBe("#1C1B19");
    const { html } = renderMail(
      { preheader: "", heading: "T", paragraphs: [] },
      { ...party, color: "red;background:url(x)" },
      "fr",
      site,
    );
    expect(html).not.toContain("url(x)");
    expect(html).toContain("#0F6E66");
  });

  it("joint le logo du parti et l'affiche dans l'en-tête", () => {
    const m = composeMail({
      to: "a@example.test",
      subject: "S",
      body: RECEIPT_MESSAGES.ht.body({ number: "R-1", amount: "500,00 HTG", method: "MonCash", periods: "2026", recordedBy: "" }),
      brand: { ...party, logo: { content: Buffer.from("png"), contentType: "image/png" } },
      locale: "ht",
    });
    expect(m.fromName).toBe("Parti Horizon");
    expect(m.attachments?.[0]).toMatchObject({ contentId: "logo", filename: "logo.png", contentType: "image/png" });
    expect(m.html).toContain('src="cid:logo"');
    expect(m.html).toContain('lang="ht"');
    expect(m.text).toContain("Kantite : 500,00 HTG");
    expect(m.text).not.toContain("Moun ki anrejistre l");
  });

  it("signe les messages de la plateforme au nom de civora", () => {
    const m = composeMail({
      to: "a@example.test",
      subject: "S",
      body: { preheader: "", heading: "T", paragraphs: [] },
      brand: PLATFORM_BRAND,
      locale: "fr",
    });
    expect(m.attachments).toBeUndefined();
    expect(m.html).toContain(`${site}/email/civora-mark.png`);
    expect(m.text).toContain("Un produit de CODESHELL LLC.");
  });

  it("nettoie le nom d'expéditeur", () => {
    expect(formatFrom("civora <notifications@civora.space>", 'Parti "X"\r\nBcc: a@b.c')).toBe(
      '"Parti X Bcc: a@b.c" <notifications@civora.space>',
    );
    expect(formatFrom("civora <notifications@civora.space>")).toBe("civora <notifications@civora.space>");
  });
});
