// Contrôle de cohérence de docs/requirements.md : identifiants uniques, statuts et phases valides.
import { readFileSync } from "node:fs";

const text = readFileSync(new URL("../docs/requirements.md", import.meta.url), "utf8");
const rows = text.split("\n").filter((l) => /^\| [A-Z]{2,3}-\d{2} \|/.test(l));
const ids = new Set();
const errors = [];
const statuses = new Set(["à faire", "en cours", "fait"]);

for (const row of rows) {
  const cells = row
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);
  const id = cells[0];
  const status = cells[cells.length - 1];
  if (ids.has(id)) errors.push(`Identifiant en double : ${id}`);
  ids.add(id);
  if (!statuses.has(status)) errors.push(`${id} : statut inconnu « ${status} »`);
  if (!/P[1-5]/.test(row)) errors.push(`${id} : phase manquante`);
}

const done = rows.filter((r) => r.trim().endsWith("| fait |")).length;
console.log(`${ids.size} exigences, ${done} faites.`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
