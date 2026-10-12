// ADH-07 : lecture, reconnaissance des colonnes, mise en forme et zones d'un fichier de membres (sans base).
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { suggestMapping } from "../src/modules/members/import/fields.js";
import {
  cleanName,
  normalizeDate,
  normalizeEmail,
  normalizePhone,
  splitFullName,
  splitTags,
} from "../src/modules/members/import/normalize.js";
import { parseCsv, readTable, sheetExportUrl, toTable } from "../src/modules/members/import/parse.js";
import { sectionParts, ZoneIndex, type ZoneRow } from "../src/modules/members/import/zone-match.js";

describe("lecture du fichier", () => {
  it("CSV au point-virgule, guillemets, lignes vides, numéros de ligne du fichier", () => {
    const t = toTable(
      parseCsv('﻿Prénom;Nom;Téléphone\r\n"Marie; dite Mimi";Joseph;3712 3456\r\n\r\nPaul;Saint-Fleur;\r\n'),
    );
    expect(t.headers).toEqual(["Prénom", "Nom", "Téléphone"]);
    expect(t.rows).toEqual([
      { line: 2, cells: ["Marie; dite Mimi", "Joseph", "3712 3456"] },
      { line: 4, cells: ["Paul", "Saint-Fleur", ""] },
    ]);
  });

  it("CSV enregistré par Excel en Windows-1252", async () => {
    const t = await readTable(
      Buffer.from([0x50, 0x72, 0xe9, 0x6e, 0x6f, 0x6d, 0x0a, 0x4e, 0xe9, 0x6d, 0x61]),
      "text/csv",
      "a.csv",
    );
    expect(t.headers).toEqual(["Prénom"]);
    expect(t.rows[0]!.cells).toEqual(["Néma"]);
  });

  it("Excel : dates, liens et formules en texte", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Membres");
    ws.addRow(["Nom", "Naissance", "Email"]);
    ws.addRow(["Joseph", new Date(Date.UTC(1990, 4, 12)), { text: "m@x.ht", hyperlink: "mailto:m@x.ht" }]);
    const t = await readTable(
      Buffer.from(await wb.xlsx.writeBuffer()),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "m.xlsx",
    );
    expect(t.rows[0]!.cells).toEqual(["Joseph", "1990-05-12", "m@x.ht"]);
  });

  it("Google Sheets : seule l'adresse d'export de la feuille est construite", () => {
    expect(sheetExportUrl("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit#gid=42")).toBe(
      "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/export?format=csv&gid=42",
    );
    expect(() => sheetExportUrl("https://evil.example/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345")).toThrow();
    expect(() => sheetExportUrl("http://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345")).toThrow();
  });
});

describe("colonnes reconnues", () => {
  it("en-têtes français, créoles et anglais", () => {
    expect(
      suggestMapping([
        "Non",
        "Siyati",
        "Telefòn",
        "Courriel",
        "Date de naissance",
        "CIN",
        "Commune",
        "Section communale",
        "Statut",
      ]),
    ).toEqual({
      firstName: 0,
      lastName: 1,
      phone: 2,
      email: 3,
      birthDate: 4,
      nin: 5,
      commune: 6,
      section: 7,
      status: 8,
    });
    expect(suggestMapping(["Nom et prénom", "Tel"])).toEqual({ fullName: 0, phone: 1 });
  });
});

describe("mise en forme", () => {
  it("noms", () => {
    expect(cleanName("  jean   PIERRE-louis ")).toBe("jean PIERRE-louis");
    expect(cleanName("JEAN PIERRE-LOUIS")).toBe("Jean Pierre-Louis");
    expect(splitFullName("PIERRE Jean Robert")).toEqual({ firstName: "Jean Robert", lastName: "Pierre" });
    expect(splitFullName("Marie Joseph")).toEqual({ firstName: "Marie", lastName: "Joseph" });
    expect(splitFullName("Marie")).toBeNull();
  });

  it("téléphones d'Haïti et de la diaspora", () => {
    expect(normalizePhone("3712-3456")).toBe("+50937123456");
    expect(normalizePhone("(509) 3712 3456")).toBe("+50937123456");
    expect(normalizePhone("00509 37123456")).toBe("+50937123456");
    expect(normalizePhone("305 555 0199")).toBe("+13055550199");
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(normalizePhone("1234")).toBeNull();
    expect(normalizePhone("pas de tel")).toBeNull();
  });

  it("e-mails et dates", () => {
    expect(normalizeEmail(" Marie@Example.HT ")).toBe("marie@example.ht");
    expect(normalizeEmail("marie@")).toBeNull();
    expect(normalizeDate("14/03/1990")).toBe("1990-03-14");
    expect(normalizeDate("03/14/1990")).toBe("1990-03-14");
    expect(normalizeDate("1990-03-14")).toBe("1990-03-14");
    expect(normalizeDate("31/02/1990")).toBeNull();
    expect(normalizeDate("32874")).toBe("1990-01-01");
    expect(normalizeDate("14/03/2090", { max: "2026-12-31" })).toBeNull();
  });

  it("étiquettes", () => {
    expect(splitTags("Jeunes, diaspora ; JEUNES|femmes")).toEqual(["jeunes", "diaspora", "femmes"]);
  });
});

describe("zones", () => {
  const z = (
    id: string,
    level: string,
    name: string,
    parentId: string | null,
    nameHt: string | null = null,
  ): ZoneRow => ({
    id,
    code: id,
    level,
    name,
    nameHt,
    parentId,
    path: id,
  });
  const index = new ZoneIndex([
    z("HT0113", "commune", "Carrefour", null, "Kafou"),
    z("HT0113-01", "section_communale", "1re Section Morne Chandelle", "HT0113"),
    z("HT0113-02", "section_communale", "2e Section Platon Dufréné", "HT0113"),
    z("HT0112", "commune", "Delmas", null, "Dèlma"),
    z("HT0112-01", "section_communale", "1re Section Saint Martin", "HT0112"),
    z("HT0711", "commune", "Jérémie", null),
    z("HT0711-01", "section_communale", "1re Section Basse Voldrogue", "HT0711"),
    z("HT0711-02", "section_communale", "2e Section Haute Voldrogue", "HT0711"),
    z("DIA-US", "diaspora_pays", "États-Unis", null),
    z("DIA-US-MIA", "diaspora_ville", "Miami", "DIA-US"),
  ]);

  it("rang et nom d'une section", () => {
    expect(sectionParts("1re Section Morne Chandelle")).toEqual({ rank: 1, name: "morne chandelle" });
    expect(sectionParts("Deuxième section")).toEqual({ rank: 2, name: "" });
    expect(sectionParts("section 2")).toEqual({ rank: 2, name: "" });
  });

  it("commune et section, par le nom ou par le rang", () => {
    expect(index.match({ commune: "Kafou", section: "Morne Chandelle" })?.code).toBe("HT0113-01");
    expect(index.match({ commune: "carrefour", section: "2e section" })?.code).toBe("HT0113-02");
    expect(index.match({ commune: "Jérémie", section: "2" })?.code).toBe("HT0711-02");
    expect(index.match({ section: "1re Section Saint-Martin" })?.code).toBe("HT0112-01");
  });

  it("commune seule : la section est retrouvée si elle est unique, sinon correction", () => {
    expect(index.match({ commune: "Delmas" })?.code).toBe("HT0112-01");
    expect(index.match({ commune: "Carrefour" })).toBeNull();
    expect(index.match({ commune: "Inconnue", section: "1" })).toBeNull();
  });

  it("diaspora : ville, sinon pays", () => {
    expect(index.match({ city: "Miami", country: "USA" })?.code).toBe("DIA-US-MIA");
    expect(index.match({ country: "Etats-Unis" })?.code).toBe("DIA-US");
    expect(index.match({ country: "Haïti" })).toBeNull();
  });
});
