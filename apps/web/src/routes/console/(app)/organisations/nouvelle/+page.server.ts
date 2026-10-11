import { error, fail, redirect } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { CONSOLE_COOKIE } from "$lib/server/console-session";
import type { Actions, PageServerLoad } from "./$types";

/** Création manuelle d'une organisation (SOC-10), réservée au propriétaire. */
export const load: PageServerLoad = async ({ parent }) => {
  const { staff } = await parent();
  if (staff.role !== "owner") error(403, { message: "forbidden", code: "forbidden" });
  return {};
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export const actions: Actions = {
  default: async ({ request, cookies, getClientAddress }) => {
    const f = await request.formData();
    const values = Object.fromEntries(
      ["name", "slug", "kind", "tier", "firstName", "lastName", "email", "zoneCode", "zoneLabel"].map((k) => [
        k,
        text(f, k),
      ]),
    );
    let id = "";
    try {
      const r = await api<{ partyId: string }>("/console/organizations", {
        body: {
          party: { name: values.name, slug: (values.slug ?? "").toLowerCase(), kind: values.kind, tier: values.tier },
          founder: {
            firstName: values.firstName,
            lastName: values.lastName,
            email: values.email,
            zoneCode: values.zoneCode,
          },
        },
        consoleToken: cookies.get(CONSOLE_COOKIE)!,
        ip: getClientAddress(),
      });
      id = r.partyId;
    } catch (e) {
      if (e instanceof ApiFailure) return fail(400, { code: e.code, values });
      throw e;
    }
    redirect(303, `/console/organisations/${id}`);
  },
};
