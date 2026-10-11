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

export const TIERS: readonly Tier[] = ["essentiel", "mouvement", "national"];

/**
 * Droits effectifs d'un parti, lus en base à chaque requête (cache court côté API) :
 * changer de palier ou activer une option prend effet sans redéploiement (SOC-07).
 */
export interface Entitlements {
  tier: Tier;
  /** Module Élections : option par cycle, actif jusqu'à cette date. */
  electionsModuleUntil: Date | null;
  biConnectorOption: boolean;
  extraStoragePacks: number;
  /** Abonnement suspendu après impayé (SOC-08) : lecture seule, aucune fonctionnalité payante. */
  suspended: boolean;
}

/** Fonctionnalités hors paliers : options achetées séparément. */
export type AddOnFeature = "elections";

/** Le module Élections est une option : actif si la date de fin n'est pas dépassée. */
export function hasElectionsModule(electionsModuleUntil: Date | null, now = new Date()): boolean {
  return electionsModuleUntil !== null && electionsModuleUntil > now;
}

export function hasFeature(tier: Tier, feature: Feature, opts?: { biConnectorOption?: boolean }): boolean {
  if (feature === "bi.connector" && opts?.biConnectorOption) return true;
  return PLANS[tier].features.has(feature);
}

/** Point d'entrée commun à l'API (requireFeature), au web et au mobile (hasFeature sur les droits du parti). */
export function can(e: Entitlements, feature: Feature | AddOnFeature, now = new Date()): boolean {
  if (e.suspended) return false;
  if (feature === "elections") return hasElectionsModule(e.electionsModuleUntil, now);
  return hasFeature(e.tier, feature, { biConnectorOption: e.biConnectorOption });
}

/**
 * Palier minimal qui inclut la fonctionnalité, pour afficher l'option verrouillée avec son palier
 * plutôt que de la masquer (vente additionnelle). null : option hors palier (module Élections).
 */
export function requiredTier(feature: Feature | AddOnFeature): Tier | null {
  if (feature === "elections") return null;
  return TIERS.find((t) => PLANS[t].features.has(feature)) ?? null;
}

export type QuotaKey = keyof PlanDefinition["quotas"];

/**
 * Nature de chaque quota : « hard » bloque l'action ; « billed » l'autorise et facture le dépassement
 * (tranches de 1 000 membres, packs de 50 Go : job billing.overage, SOC-08).
 */
export const QUOTA_KIND: Record<QuotaKey, "hard" | "billed"> = {
  members: "billed",
  storageGb: "billed",
  admins: "hard",
  customDuesPlans: "hard",
  activeInternalElections: "hard",
  siteLanguages: "hard",
};

/** Limite effective, packs de stockage compris. null : illimité. */
export function quotaLimit(e: Entitlements, key: QuotaKey): number | null {
  const base = PLANS[e.tier].quotas[key];
  if (key === "storageGb" && base !== null) return base + e.extraStoragePacks * ADD_ONS.storagePack.gb;
  return base;
}

export interface QuotaCheck {
  allowed: boolean;
  limit: number | null;
  /** Unités au-delà de la limite après l'opération (facturées si le quota est « billed »). */
  overage: number;
}

/** Contrôle avant d'ajouter `adding` unités à un usage `current`. */
export function checkQuota(e: Entitlements, key: QuotaKey, current: number, adding = 1): QuotaCheck {
  const limit = quotaLimit(e, key);
  if (limit === null) return { allowed: true, limit, overage: 0 };
  const overage = Math.max(0, current + adding - limit);
  return { allowed: overage === 0 || QUOTA_KIND[key] === "billed", limit, overage };
}
