import { dev } from "$app/environment";
import { error } from "@sveltejs/kit";

/** Vitrine des composants : outil interne de développement, jamais servi en production. */
export const load = () => {
  if (!dev) error(404, { message: "not_found", code: "not_found" });
};
