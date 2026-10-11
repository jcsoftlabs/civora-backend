/**
 * Paliers, quotas et fonctionnalités (cahier des charges, section 2 ; SOC-07).
 * Source unique : l'API (requireFeature) et les interfaces (hasFeature) lisent ce fichier.
 * Les prix sont des hypothèses à valider auprès des partis.
 */

export type Tier = "essentiel" | "mouvement" | "national";

export type Feature =
  | "members.import"
  | "members.referralAdmission"
  | "members.card"
  | "dues.customPlans"
  | "dues.differentiatedAmounts"
  | "dues.lateEffects"
  | "dues.prepay"
  | "dues.specialContributions"
  | "payments.local"
  | "payments.stripe"
  | "organs.custom"
  | "organs.mandates"
  | "organs.orgChart"
  | "territory.departement"
  | "territory.sectionCommunale"
  | "attendance.qr"
  | "attendance.rotatingQr"
  | "gamification"
  | "gamification.challenges"
  | "gamification.rewards"
  | "votes.internal"
  | "votes.advanced"
  | "votes.inPerson"
  | "training"
  | "training.certificates"
  | "communication.sms"
  | "communication.whatsapp"
  | "communication.chat"
  | "communication.ussd"
  | "communication.voice"
  | "surveys"
  | "meetings"
  | "petitions"
  | "documents"
  | "documents.versions"
  | "finance.ledger"
  | "finance.budgets"
  | "finance.compliance"
  | "bi.indicators"
  | "bi.dashboards"
  | "bi.exports"
  | "bi.warehouse"
  | "bi.connector"
  | "bi.dataApi"
  | "analytics.ai"
  | "media.monitoring"
  | "site.public"
  | "site.customDomain"
  | "app.whiteLabelStores";

export interface PlanDefinition {
  tier: Tier;
  priceUsd: { monthly: number; annual: number };
  quotas: {
    members: number | null; // null = illimité
    admins: number | null;
    storageGb: number;
    customDuesPlans: number | null;
    activeInternalElections: number | null;
    siteLanguages: number;
  };
  features: ReadonlySet<Feature>;
  support: string;
}

const essentiel: Feature[] = [
  "members.import",
  "members.referralAdmission",
  "dues.customPlans",
  "payments.local",
  "organs.custom",
  "attendance.qr",
  "votes.internal",
  "communication.sms",
  "communication.whatsapp",
  "documents",
  "bi.indicators",
  "site.public",
];

const mouvement: Feature[] = [
  ...essentiel,
  "members.card",
  "dues.differentiatedAmounts",
  "dues.lateEffects",
  "dues.prepay",
  "payments.stripe",
  "organs.mandates",
  "organs.orgChart",
  "territory.departement",
  "attendance.rotatingQr",
  "gamification",
  "votes.advanced",
  "training",
  "communication.chat",
  "communication.ussd",
  "communication.voice",
  "surveys",
  "documents.versions",
  "finance.ledger",
  "bi.dashboards",
  "bi.exports",
];

const national: Feature[] = [
  ...mouvement,
  "dues.specialContributions",
  "territory.sectionCommunale",
  "gamification.challenges",
  "gamification.rewards",
  "votes.inPerson",
  "training.certificates",
  "meetings",
  "petitions",
  "finance.budgets",
  "finance.compliance",
  "bi.warehouse",
  "bi.connector",
  "bi.dataApi",
  "analytics.ai",
  "media.monitoring",
  "site.customDomain",
  "app.whiteLabelStores",
];

export const PLANS: Record<Tier, PlanDefinition> = {
  essentiel: {
    tier: "essentiel",
    priceUsd: { monthly: 149, annual: 1490 },
    quotas: {
      members: 1000,
      admins: 2,
      storageGb: 10,
      customDuesPlans: 2,
      activeInternalElections: 1,
      siteLanguages: 1,
    },
    features: new Set(essentiel),
    support: "E-mail",
  },
  mouvement: {
    tier: "mouvement",
    priceUsd: { monthly: 449, annual: 4490 },
    quotas: {
      members: 10000,
      admins: 10,
      storageGb: 50,
      customDuesPlans: null,
      activeInternalElections: null,
      siteLanguages: 2,
    },
    features: new Set(mouvement),
    support: "WhatsApp, 48 h",
  },
  national: {
    tier: "national",
    priceUsd: { monthly: 1200, annual: 12000 },
    quotas: {
      members: null,
      admins: null,
      storageGb: 250,
      customDuesPlans: null,
      activeInternalElections: null,
      siteLanguages: 4,
    },
    features: new Set(national),
    support: "Référent dédié, 24 h",
  },
};

/** Options et dépassements (section 2, facturation complémentaire). */
export const ADD_ONS = {
  electionsModule: { priceUsd: 2500, months: 6, includedStations: 200, extraStationUsd: 8 },
  storagePack: { gb: 50, monthlyUsd: 10 },
  membersBlock: { size: 1000 },
  whiteLabelPublicationUsd: 1500,
  setupFeeUsd: { essentiel: 300, mouvement: 900, national: 2000 },
  biConnectorMonthlyUsd: null as number | null, // à fixer
  platformCommissionOnDonations: 0, // jamais de commission
} as const;

/** Le module Élections est une option : actif si la date de fin n'est pas dépassée. */
export function hasFeature(tier: Tier, feature: Feature, opts?: { biConnectorOption?: boolean }): boolean {
  if (feature === "bi.connector" && opts?.biConnectorOption) return true;
  return PLANS[tier].features.has(feature);
}

export function hasElectionsModule(electionsModuleUntil: Date | null, now = new Date()): boolean {
  return electionsModuleUntil !== null && electionsModuleUntil > now;
}
