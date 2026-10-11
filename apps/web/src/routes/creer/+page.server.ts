import { PLANS, TIERS } from "@civora/shared";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = () => ({
  tiers: TIERS.map((t) => ({ id: t, monthlyUsd: PLANS[t].priceUsd.monthly, languages: PLANS[t].quotas.siteLanguages })),
});
