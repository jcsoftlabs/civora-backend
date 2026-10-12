// ADH-07 : lecture d'un fichier de membres (Excel, CSV) ou d'une feuille Google Sheets partagée, en tableau de
// textes. La première ligne non vide donne les en-têtes ; les lignes vides sont ignorées, le numéro de ligne du
// fichier est conservé pour le rapport d'erreurs.
import ExcelJS from "exceljs";
import { ApiError } from "../../../plugins/errors.js";

export const MAX_IMPORT_ROWS = 20_000;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export interface Table {
  headers: string[];
  /** Lignes de données avec leur numéro dans le fichier (en-tête comprise, à partir de 1). */
  rows: { line: number; cells: string[] }[];
}

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const IMPORT_TYPES = [XLSX, "text/csv", "application/vnd.ms-excel", "text/plain"];

/** Texte d'une cellule Excel : dates en AAAA-MM-JJ, liens par leur texte, formules par leur résultat. */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    if ("error" in v) return "";
  }
  return String(v).trim();
}

async function readXlsx(body: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(body as unknown as ArrayBuffer);
  } catch {
    throw new ApiError(400, "import_unreadable");
  }
  const sheet = wb.worksheets[0];
  if (!sheet) throw new ApiError(400, "import_empty");
  const out: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, n) => {
    const cells: string[] = [];
    for (let c = 1; c <= row.cellCount; c++) cells.push(cellText(row.getCell(c).value).trim());
    out[n - 1] = cells;
  });
  return Array.from(out, (r) => r ?? []);
}

/** UTF-8, sinon Windows-1252 (CSV enregistré par Excel) : jamais de caractères remplacés en silence. */
function decode(body: Buffer): string {
  const utf8 = body.toString("utf8");
  const text = utf8.includes("�") ? new TextDecoder("windows-1252").decode(body) : utf8;
  return text.replace(/^\uFEFF/, "");
}

/** CSV avec guillemets, séparateur deviné sur la première ligne (virgule, point-virgule ou tabulation). */
export function parseCsv(text: string): string[][] {
  const nl = text.search(/\r?\n/);
  const first = nl < 0 ? text : text.slice(0, nl);
  const sep = [";", "\t", ","].map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

/** Tableau d'en-têtes et de lignes, à partir des lignes brutes. */
export function toTable(raw: string[][]): Table {
  const headerIndex = raw.findIndex((r) => r.some((c) => c !== ""));
  if (headerIndex < 0) throw new ApiError(400, "import_empty");
  const headers = raw[headerIndex]!.map((h) => h.trim());
  const rows: Table["rows"] = [];
  for (let i = headerIndex + 1; i < raw.length; i++) {
    const cells = raw[i] ?? [];
    if (!cells.some((c) => c !== "")) continue;
    rows.push({ line: i + 1, cells: headers.map((_, c) => (cells[c] ?? "").trim()) });
    if (rows.length > MAX_IMPORT_ROWS) throw new ApiError(400, "import_too_large");
  }
  if (!rows.length) throw new ApiError(400, "import_empty");
  return { headers, rows };
}

export async function readTable(body: Buffer, mimeType: string, name: string): Promise<Table> {
  if (body.length > MAX_IMPORT_BYTES) throw new ApiError(400, "import_too_large");
  const xlsx = mimeType === XLSX || /\.xlsx$/i.test(name);
  if (!xlsx && /\.xls$/i.test(name)) throw new ApiError(400, "import_xls_unsupported");
  return toTable(xlsx ? await readXlsx(body) : parseCsv(decode(body)));
}

/**
 * Feuille Google Sheets partagée par lien : lue en CSV par l'adresse d'export, construite ici à partir de
 * l'identifiant seulement (aucune autre adresse n'est jamais appelée). Feuille privée : refusée.
 */
export function sheetExportUrl(url: string): string {
  const m = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})(?:[/?#]|$)/.exec(url.trim());
  if (!m) throw new ApiError(400, "sheet_url_invalid");
  const gid = /[#&?]gid=(\d{1,12})/.exec(url)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}

export async function fetchSheet(url: string, fetcher: typeof fetch = fetch): Promise<Buffer> {
  const res = await fetcher(sheetExportUrl(url), { redirect: "follow", signal: AbortSignal.timeout(20_000) }).catch(
    () => null,
  );
  if (!res || !res.ok || !(res.headers.get("content-type") ?? "").includes("text/csv"))
    throw new ApiError(400, "sheet_not_public");
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > MAX_IMPORT_BYTES) throw new ApiError(400, "import_too_large");
  return body;
}
