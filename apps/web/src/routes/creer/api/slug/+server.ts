import { json } from "@sveltejs/kit";
import { api } from "$lib/server/api";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  const slug = url.searchParams.get("slug") ?? "";
  return json(await api(`/parties/slug-availability?slug=${encodeURIComponent(slug)}`, { ip: getClientAddress() }));
};
