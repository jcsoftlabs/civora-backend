import { isOrganizationKind, PLANS, TIERS, type Tier } from "@civora/shared";
import type { PageServerLoad } from "./$types";

/** Formule et type d'organisation préchoisis depuis le site commercial (?formule=, ?type=). */
export const load: PageServerLoad = ({ url }) => {
  const formule = url.searchParams.get("formule");
  const type = url.searchParams.get("type");
  return {
    tiers: TIERS.map((t) => ({
      id: t,
      monthlyUsd: PLANS[t].priceUsd.monthly,
      languages: PLANS[t].quotas.siteLanguages,
    })),
    initialTier: (TIERS as readonly string[]).includes(formule ?? "") ? (formule as Tier) : null,
    initialKind: isOrganizationKind(type) ? type : null,
  };
};
