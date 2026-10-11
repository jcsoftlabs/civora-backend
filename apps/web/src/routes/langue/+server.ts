import { redirect } from "@sveltejs/kit";
import { isLocale } from "$lib/i18n";
import type { RequestHandler } from "./$types";

/** Choix de la langue : mémorisé un an dans un cookie, sans JavaScript côté client. */
export const POST: RequestHandler = async ({ request, cookies }) => {
  const lang = (await request.formData()).get("lang");
  if (typeof lang === "string" && isLocale(lang)) {
    cookies.set("lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  }
  redirect(303, request.headers.get("referer") ?? "/");
};
