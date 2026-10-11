// Type d'organisation de l'espace consulté (SOC-11), transmis aux écrans par le contexte Svelte : sûr côté
// serveur (une valeur par rendu, jamais partagée entre requêtes), lu à l'initialisation de chaque composant.
import { getContext, setContext } from "svelte";
import type { OrganizationKind } from "@civora/shared";

const KEY = Symbol("organization-kind");

/** Posé par la mise en page du back-office (ou de l'assistant) avec une fonction qui lit le type courant. */
export function setOrganizationKind(read: () => OrganizationKind) {
  setContext(KEY, read);
}

/**
 * Lecteur du type courant, à appeler dans un `$derived` pour suivre un changement (réglages, assistant) ;
 * un parti hors d'un espace (site commercial, pages d'erreur).
 */
export function organizationKind(): () => OrganizationKind {
  const read = getContext<(() => OrganizationKind) | undefined>(KEY);
  return () => read?.() ?? "party";
}
