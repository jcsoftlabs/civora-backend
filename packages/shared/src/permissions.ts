/**
 * Permissions attachées aux postes (ORG-04, SOC-06, SEC-05).
 * Le parti nomme librement ses organes et postes ; il compose leurs droits à partir de cette liste.
 * Chaque permission s'exerce dans la portée territoriale du poste (zone et sous-zones).
 */

export const PERMISSIONS = [
  // Membres
  "members.read",
  "members.write",
  "members.approve",
  "members.export",
  "members.import",
  "identity.read", // lecture d'une pièce d'identité déchiffrée : toujours auditée
  // Argent
  "dues.manage",
  "payments.read",
  "payments.recordCash",
  "donations.manage",
  "finance.ledger",
  "finance.budgets",
  // Organisation
  "organs.manage",
  "posts.assign",
  "settings.party",
  "billing.manage",
  // Engagement
  "events.manage",
  "attendance.scanOthers",
  "gamification.manage",
  "surveys.manage",
  // Votes internes
  "votes.manage",
  "votes.certify",
  // Contenus et communication
  "publications.manage",
  "outreach.send",
  "training.manage",
  "documents.read",
  "documents.write",
  // Données
  "bi.read",
  "bi.export",
  "bi.connector",
  "audit.read", // journal d'audit et vérification de son intégrité (SEC-06)
  // Élections
  "elections.manage",
  "elections.supervise",
  "elections.observe",
  "elections.legal",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Regroupement pour l'écran des postes (cases à cocher par domaine). Couvre toute la liste, une seule fois. */
export const PERMISSION_GROUPS: Record<string, Permission[]> = {
  members: ["members.read", "members.write", "members.approve", "members.export", "members.import", "identity.read"],
  money: [
    "dues.manage",
    "payments.read",
    "payments.recordCash",
    "donations.manage",
    "finance.ledger",
    "finance.budgets",
  ],
  organization: ["organs.manage", "posts.assign", "settings.party", "billing.manage"],
  engagement: ["events.manage", "attendance.scanOthers", "gamification.manage", "surveys.manage"],
  votes: ["votes.manage", "votes.certify"],
  content: ["publications.manage", "outreach.send", "training.manage", "documents.read", "documents.write"],
  data: ["bi.read", "bi.export", "bi.connector", "audit.read"],
  elections: ["elections.manage", "elections.supervise", "elections.observe", "elections.legal"],
};

/** Modèles proposés à la création d'un espace : le parti peut les renommer et les modifier. */
export const POST_TEMPLATES: Record<string, Permission[]> = {
  "Président ou présidente": [...PERMISSIONS],
  "Secrétaire général": [
    "members.read",
    "members.write",
    "members.approve",
    "organs.manage",
    "posts.assign",
    "events.manage",
    "publications.manage",
    "outreach.send",
    "documents.read",
    "documents.write",
    "votes.manage",
    "bi.read",
  ],
  Trésorier: [
    "members.read",
    "dues.manage",
    "payments.read",
    "payments.recordCash",
    "donations.manage",
    "finance.ledger",
    "bi.read",
    "bi.export",
  ],
  "Responsable de section": [
    "members.read",
    "members.write",
    "members.approve",
    "events.manage",
    "attendance.scanOthers",
    "outreach.send",
    "documents.read",
    "documents.write",
    "bi.read",
  ],
  "Responsable formation": ["members.read", "training.manage", "bi.read"],
  "Responsable communication": ["publications.manage", "outreach.send", "surveys.manage", "documents.read"],
  "Superviseur électoral": ["elections.supervise", "elections.observe", "members.read"],
  Mandataire: ["elections.observe"],
  "Cellule juridique": ["elections.legal", "documents.read"],
};

/** Permissions dont chaque usage écrit une ligne dans audit_log (SEC-06). */
export const AUDITED: ReadonlySet<Permission> = new Set([
  "identity.read",
  "members.export",
  "bi.export",
  "posts.assign",
  "settings.party",
  "billing.manage",
  "votes.certify",
]);
