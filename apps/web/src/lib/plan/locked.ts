import { requiredTier, type AddOnFeature, type Feature } from "@civora/shared";
import { format, type translator } from "$lib/i18n";

/** Message de l'option verrouillée : palier requis, ou option hors palier (module Élections). */
export function lockedMessage(t: ReturnType<typeof translator>, feature: Feature | AddOnFeature): string {
  const tier = requiredTier(feature);
  return tier ? format(t("plan.lockedIn"), { tier: t(`plan.${tier}`) }) : t("plan.lockedOption");
}
