import { error, fail } from "@sveltejs/kit";
import { ApiFailure, api } from "$lib/server/api";
import { currentSession } from "$lib/server/session";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";

export interface Payment {
  id: string;
  memberId: string;
  firstName: string;
  lastName: string;
  memberNumber: string;
  kind: "dues" | "donation" | "special_contribution";
  amount: string;
  currency: string;
  provider: string;
  status: "pending" | "succeeded" | "failed" | "refunded";
  createdAt: string;
  confirmedAt: string | null;
  receiptId: string | null;
  receiptNumber: string | null;
}
export interface Plan {
  id: string;
  name: { fr: string; ht?: string };
  amount: string;
  currency: string;
  periodicity: "monthly" | "quarterly" | "semiannual" | "annual" | "once";
  dueRule: "anniversary" | "fixed";
  fixedDueDay: string | null;
  graceDays: number;
  isDefault: boolean;
  active: boolean;
  subscribers: number;
}
export interface Summary {
  currentMonth: Array<{ currency: string; total: string; count: number }>;
  previousMonth: Array<{ currency: string; total: string; count: number }>;
  members: { late: number; upToDate: number };
}
export interface Obligation {
  id: string;
  planName: { fr: string; ht?: string };
  periodStart: string;
  dueDate: string;
  amount: string;
  currency: string;
  paidAt: string | null;
  state: "paid" | "upcoming" | "due" | "late";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIEWS = ["paiements", "formules", "comptes"] as const;

/** FIN-03, FIN-05, FIN-10, FIN-12 : journal, formules, encaissement en espèces, comptes marchands. */
export const load: PageServerLoad = async ({ url, cookies, locals, getClientAddress }) => {
  const s = (await currentSession(cookies, locals.partySlug!))!;
  const can = (p: string) => s.me.permissions.includes(p);
  if (!can("payments.read") && !can("dues.manage") && !can("payments.recordCash"))
    error(403, { message: "forbidden", code: "forbidden" });
  const call = <T>(path: string) => api<T>(path, { token: s.token, ip: getClientAddress() });

  const asked = url.searchParams.get("vue");
  const view = (VIEWS as readonly string[]).includes(asked ?? "")
    ? (asked as (typeof VIEWS)[number])
    : can("payments.read")
      ? "paiements"
      : "formules";

  const params = new URLSearchParams({ limit: "50" });
  for (const k of ["status", "provider", "before"]) {
    const v = url.searchParams.get(k);
    if (v) params.set(k, v);
  }
  const [summary, payments, plans, accounts] = await Promise.all([
    can("payments.read") ? call<Summary>("/payments/summary") : null,
    view === "paiements" && can("payments.read")
      ? call<{ payments: Payment[] }>(`/payments?${params}`)
          .then((r) => r.payments)
          .catch(() => [] as Payment[])
      : [],
    view === "formules" || url.searchParams.has("formule")
      ? call<{ plans: Plan[] }>("/dues/plans").then((r) => r.plans)
      : [],
    view === "comptes" && (can("settings.party") || can("payments.read"))
      ? call<{ accounts: Array<{ id: string; provider: string; currency: string; active: boolean }> }>(
          "/merchant-accounts",
        ).then((r) => r.accounts)
      : [],
  ]);

  // Encaissement : membre choisi (?membre=) et ses échéances non réglées.
  let cash: { member: { id: string; name: string; number: string }; obligations: Obligation[] } | null = null;
  const memberId = url.searchParams.get("membre");
  if (url.searchParams.has("encaisser") && memberId && UUID.test(memberId)) {
    try {
      const [m, dues] = await Promise.all([
        call<{ id: string; firstName: string; lastName: string; memberNumber: string }>(`/members/${memberId}`),
        call<{ obligations: Obligation[] }>(`/members/${memberId}/dues`),
      ]);
      cash = {
        member: { id: m.id, name: `${m.firstName} ${m.lastName}`, number: m.memberNumber },
        obligations: dues.obligations.filter((o) => !o.paidAt),
      };
    } catch (e) {
      if (!(e instanceof ApiFailure)) throw e;
    }
  }

  return {
    view,
    summary,
    payments,
    plans,
    accounts,
    cashing: url.searchParams.has("encaisser") && can("payments.recordCash"),
    cash,
    planPanel: url.searchParams.get("formule"),
  };
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function act(event: RequestEvent, call: (f: FormData, token: string, ip: string) => Promise<object | void>) {
  const s = await currentSession(event.cookies, event.locals.partySlug!);
  if (!s || s.me.mfaPending) return fail(401, { code: "unauthorized" });
  const f = await event.request.formData();
  try {
    return { ok: true, ...((await call(f, s.token, event.getClientAddress())) ?? {}) };
  } catch (e) {
    if (e instanceof ApiFailure) return fail(e.status === 429 ? 429 : 400, { code: e.code });
    throw e;
  }
}

const planBody = (f: FormData, creating: boolean) => {
  const name = { fr: text(f, "nameFr"), ...(text(f, "nameHt") ? { ht: text(f, "nameHt") } : {}) };
  const common = {
    name,
    amount: text(f, "amount").replace(",", "."),
    graceDays: Number(text(f, "graceDays") || "15"),
    isDefault: text(f, "isDefault") === "true",
  };
  if (!creating) return { ...common, active: text(f, "active") !== "false" };
  return {
    ...common,
    currency: text(f, "currency") || "HTG",
    periodicity: text(f, "periodicity"),
    dueRule: text(f, "dueRule") || "anniversary",
    ...(text(f, "dueRule") === "fixed" ? { fixedDueDay: text(f, "fixedDueDay") } : {}),
  };
};

export const actions: Actions = {
  /** FIN-10 : saisie en espèces ; `clientRef` (généré par le navigateur) évite un double enregistrement. */
  cash: (event) =>
    act(event, async (f, token, ip) => {
      const r = await api<{ paymentId: string; receiptId: string; receiptNumber: string }>("/payments/cash", {
        body: {
          memberId: text(f, "memberId"),
          obligationIds: f.getAll("obligationIds").map(String),
          amount: text(f, "amount"),
          currency: text(f, "currency"),
          clientRef: text(f, "clientRef"),
        },
        token,
        ip,
      });
      return { done: "cash", receipt: { id: r.receiptId, number: r.receiptNumber } };
    }),
  createPlan: (event) =>
    act(event, async (f, token, ip) => {
      await api("/dues/plans", { body: planBody(f, true), token, ip });
      return { done: "planCreated" };
    }),
  updatePlan: (event) =>
    act(event, async (f, token, ip) => {
      await api(`/dues/plans/${encodeURIComponent(text(f, "id"))}`, {
        method: "PATCH",
        body: planBody(f, false),
        token,
        ip,
      });
      return { done: "planSaved" };
    }),
  generate: (event) =>
    act(event, async (_f, token, ip) => {
      const r = await api<{ created: number }>("/dues/generate", { body: {}, token, ip });
      return { done: "generated", n: r.created };
    }),
  addAccount: (event) =>
    act(event, async (f, token, ip) => {
      await api("/merchant-accounts", {
        body: { provider: text(f, "provider"), credentialsRef: text(f, "credentialsRef") },
        token,
        ip,
      });
      return { done: "accountSaved" };
    }),
  toggleAccount: (event) =>
    act(event, async (f, token, ip) => {
      await api(`/merchant-accounts/${encodeURIComponent(text(f, "id"))}`, {
        method: "PATCH",
        body: { active: text(f, "active") === "true" },
        token,
        ip,
      });
      return { done: "accountSaved" };
    }),
};
