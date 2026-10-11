import { error } from "@sveltejs/kit";

/** Les appels JSON de l'assistant viennent de la page elle-même : même origine exigée (protection CSRF). */
export function sameOrigin(request: Request, url: URL) {
  if (request.headers.get("origin") !== url.origin) error(403, { message: "forbidden", code: "forbidden" });
}
