import type { Cookies } from "@sveltejs/kit";
import type { OrganizationKind } from "@civora/shared";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/public";
import { ApiFailure, api } from "./api";

/** Session du back-office : cookie httpOnly propre à l'adresse du parti (jamais partagé entre partis). */
export const SESSION_COOKIE = "civora_session";
/**
 * Passage de relais après la création d'un parti : posé sur le domaine racine par l'assistant, il ne vit que
 * quelques minutes et devient la session de l'espace dès la première visite, après contrôle du parti.
 */
export const HANDOFF_COOKIE = "civora_handoff";

export interface Me {
  partyId: string;
  memberId: string;
  mfaPending: boolean;
  mfa: "none" | "required" | "setup_required";
  permissions: string[];
  /** Formule du parti, pour afficher verrouillées les options hors formule (SOC-07). */
  tier: "essentiel" | "mouvement" | "national" | null;
  party: {
    slug: string;
    name: string;
    kind: OrganizationKind;
    brandColor: string;
    brandColorSecondary: string | null;
  };
  member: { firstName: string; lastName: string; number: string };
}

/** Domaine du cookie de relais : le domaine racine en production, l'hôte seul en développement. */
export const handoffDomain = () => (dev ? {} : { domain: `.${env.PUBLIC_ROOT_DOMAIN || "civora.space"}` });

export function setSession(cookies: Cookies, token: string, expiresAt: string | Date) {
  cookies.set(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: !dev,
    expires: new Date(expiresAt),
  });
}

async function whoami(token: string): Promise<Me | null> {
  try {
    return await api<Me>("/auth/me", { token });
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 401) return null;
    throw e;
  }
}

/**
 * Session de la personne pour l'espace visité, ou null. Une session d'un autre parti est ignorée :
 * elle ne donne aucun accès ici, même si le jeton est valide.
 */
export async function currentSession(cookies: Cookies, partySlug: string): Promise<{ token: string; me: Me } | null> {
  const token = cookies.get(SESSION_COOKIE);
  if (token) {
    const me = await whoami(token);
    if (me && me.party.slug === partySlug) return { token, me };
    if (!me) cookies.delete(SESSION_COOKIE, { path: "/" });
  }
  const handoff = cookies.get(HANDOFF_COOKIE);
  if (handoff) {
    const me = await whoami(handoff);
    if (me && me.party.slug === partySlug) {
      setSession(cookies, handoff, new Date(Date.now() + 12 * 3600_000));
      cookies.delete(HANDOFF_COOKIE, { path: "/", ...handoffDomain() });
      return { token: handoff, me };
    }
  }
  return null;
}
