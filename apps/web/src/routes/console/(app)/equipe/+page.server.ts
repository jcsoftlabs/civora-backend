import { error, fail } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { CONSOLE_COOKIE } from "$lib/server/console-session";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";

export interface StaffRow {
  id: string;
  email: string;
  name: string;
  role: "owner" | "support";
  mfa: boolean;
  disabledAt: string | null;
  createdAt: string;
}

/** Équipe de la plateforme (SOC-10) : réservé au propriétaire. */
export const load: PageServerLoad = async ({ cookies, getClientAddress, parent }) => {
  const { staff } = await parent();
  if (staff.role !== "owner") error(403, { message: "forbidden", code: "forbidden" });
  const r = await api<{ staff: StaffRow[] }>("/console/staff", {
    consoleToken: cookies.get(CONSOLE_COOKIE)!,
    ip: getClientAddress(),
  });
  return { team: r.staff };
};

async function call(event: RequestEvent, path: string, body: object, done: string) {
  try {
    await api(path, { body, consoleToken: event.cookies.get(CONSOLE_COOKIE)!, ip: event.getClientAddress() });
    return { ok: true, done };
  } catch (e) {
    if (e instanceof ApiFailure) return fail(400, { code: e.code });
    throw e;
  }
}
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export const actions: Actions = {
  add: async (event) => {
    const f = await event.request.formData();
    return call(
      event,
      "/console/staff",
      { name: text(f, "name"), email: text(f, "email"), role: text(f, "role") },
      "staffAdded",
    );
  },
  toggle: async (event) => {
    const f = await event.request.formData();
    return call(
      event,
      `/console/staff/${encodeURIComponent(text(f, "id"))}/disabled`,
      { disabled: text(f, "disabled") === "1" },
      "staff",
    );
  },
};
