// SEC-01 : preuve d'isolation entre deux partis, pour CHAQUE table qui porte party_id.
// Ce test est obligatoire et ne doit jamais être désactivé. À compléter en P2 (fabrique de lignes par table).
import { describe, it } from "vitest";

describe("isolation entre partis", () => {
  it.todo("liste toutes les tables avec party_id depuis information_schema");
  it.todo("insère une ligne valide par table pour le parti A et pour le parti B (fabriques dans test/factories)");
  it.todo("dans withParty(A), chaque table ne renvoie aucune ligne de B");
  it.todo("dans withParty(A), insérer une ligne avec party_id = B est refusé (WITH CHECK)");
  it.todo("sans app.party_id, toute lecture renvoie zéro ligne");
  it.todo("ballots ne contient aucune colonne member_id (secret du vote)");
});
