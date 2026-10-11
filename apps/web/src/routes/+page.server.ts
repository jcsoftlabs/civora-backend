import { fail } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import type { Actions } from "./$types";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export const actions: Actions = {
  /** Demande de démonstration du site commercial (SOC-12) : relayée à l'API, qui l'envoie par e-mail. */
  demo: async ({ request, locals, getClientAddress }) => {
    if (locals.surface !== "marketing") return fail(404, { code: "not_found" });
    const f = await request.formData();
    const values = {
      name: text(f, "name"),
      organization: text(f, "organization"),
      kind: text(f, "kind"),
      size: text(f, "size"),
      phone: text(f, "phone"),
      email: text(f, "email"),
      message: text(f, "message"),
      website: text(f, "website"),
      locale: locals.locale,
    };
    try {
      await api("/public/demo-requests", { body: values, ip: getClientAddress() });
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiFailure) {
        const { website: _w, ...kept } = values;
        return fail(e.status === 429 ? 429 : 400, { code: e.code, values: kept });
      }
      throw e;
    }
  },
};
