// Plancher d'accessibilité (skill ui-design, section 8) vérifié sur les composants de base.
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { createRawSnippet } from "svelte";
import { Button, Field, Skeleton, Switch } from "../src/index.js";

const text = (s: string) => createRawSnippet(() => ({ render: () => `<span>${s}</span>` }));

describe("Switch", () => {
  it("expose role=switch, aria-checked et l'état écrit", async () => {
    let last: boolean | undefined;
    render(Switch, { label: "Organe secret", onLabel: "Oui", offLabel: "Non", onchange: (v: boolean) => (last = v) });
    const sw = screen.getByRole("switch", { name: "Organe secret" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(sw.textContent).toContain("Non");
    await userEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(sw.textContent).toContain("Oui");
    expect(last).toBe(true);
  });
});

describe("Field", () => {
  it("relie le libellé et l'erreur au champ", () => {
    render(Field, { label: "Téléphone", error: "Numéro incomplet. Saisissez 8 chiffres." });
    const input = screen.getByLabelText("Téléphone");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe("Numéro incomplet. Saisissez 8 chiffres.");
  });

  it("affiche le compteur de caractères", () => {
    render(Field, { label: "Nom de l'organe", value: "Section", maxlength: 60 });
    expect(screen.getByText("7 / 60")).toBeTruthy();
  });
});

describe("Button", () => {
  it("est un vrai bouton, désactivé pendant l'action, sans spinner", () => {
    render(Button, { pending: true, children: text("Enregistrer") });
    const btn = screen.getByRole("button", { name: "Enregistrer" });
    expect(btn.hasAttribute("disabled")).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
  });

  it("devient un lien avec href", () => {
    render(Button, { href: "/admin/membres", children: text("Voir les membres") });
    expect(screen.getByRole("link", { name: "Voir les membres" }).getAttribute("href")).toBe("/admin/membres");
  });
});

describe("Skeleton", () => {
  it("annonce le chargement aux lecteurs d'écran", () => {
    render(Skeleton, { label: "Chargement des membres", lines: 3 });
    expect(screen.getByRole("status").textContent).toContain("Chargement des membres");
  });
});

describe("Locked", () => {
  it("montre l'option verrouillée, son palier et le lien de changement de formule", async () => {
    const { Locked } = await import("../src/index.js");
    render(Locked, {
      title: "Classements et badges",
      message: "Disponible avec la formule Mouvement",
      actionLabel: "Voir les formules",
      actionHref: "/admin/abonnement",
    });
    expect(screen.getByRole("region", { name: "Classements et badges" }).textContent).toContain("Mouvement");
    expect(screen.getByRole("link", { name: "Voir les formules" }).getAttribute("href")).toBe("/admin/abonnement");
  });
});
