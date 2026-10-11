import { json } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { sameOrigin } from "../../guard";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, url }) => {
  sameOrigin(request, url);
  try {
    return json(await api("/parties/signup/start", { body: await request.json() }));
  } catch (e) {
    if (e instanceof ApiFailure) return json({ code: e.code, requiredTier: e.requiredTier }, { status: e.status });
    throw e;
  }
};
