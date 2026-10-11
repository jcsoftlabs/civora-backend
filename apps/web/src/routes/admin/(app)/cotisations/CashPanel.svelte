<!--
  Encaissement en espèces (FIN-10) : membre, échéances cochées, montant calculé, reçu numéroté.
  Le reçu enregistré prend la forme d'un ticket (bord perforé), téléchargeable en PDF.
  `clientRef` est tiré une fois par saisie : un double clic ou un renvoi n'enregistre qu'un paiement.
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import { enhance } from "$app/forms";
  import { Button, SidePanel } from "@civora/ui";
  import Lookup from "$lib/components/Lookup.svelte";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { Obligation } from "./+page.server";

  interface Props {
    cash: { member: { id: string; name: string; number: string }; obligations: Obligation[] } | null;
    locale: "fr" | "ht";
    form: { ok?: boolean; done?: string; code?: string; receipt?: { id: string; number: string } } | null;
    receiptBase: string;
    onpick: (memberId: string) => void;
    onreset: () => void;
    onclose: () => void;
  }
  let { cash, locale, form, receiptBase, onpick, onreset, onclose }: Props = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(locale, orgKind()));
  const tk = (k: string) => t(k as MessageKey);

  let open = $state(true);
  let pending = $state(false);
  let chosen = $state<string[]>([]);
  const clientRef = crypto.randomUUID();
  const receipt = $derived(form?.done === "cash" ? form.receipt : null);
  const error = $derived(form?.code ? tk(`error.${form.code}`) : null);

  const picked = $derived(cash?.obligations.filter((o) => chosen.includes(o.id)) ?? []);
  const currencies = $derived([...new Set(picked.map((o) => o.currency))]);
  // Somme exacte en centimes : jamais de flottant sur les montants.
  const totalCents = $derived(picked.reduce((n, o) => n + Math.round(Number(o.amount) * 100), 0));
  const total = $derived(`${Math.floor(totalCents / 100)}.${String(totalCents % 100).padStart(2, "0")}`);
  const money = (amount: string, currency: string) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      currencyDisplay: currency === "HTG" ? "code" : "symbol",
    }).format(Number(amount));
  const monthFmt = $derived(new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }));
  const label = (l: { fr: string; ht?: string }) => (locale === "ht" && l.ht ? l.ht : l.fr);
  const tone = { late: "late", due: "due", upcoming: "upcoming", paid: "paid" } as const;
</script>

<SidePanel bind:open title={t("admin.cash.title")} closeLabel={t("admin.sheet.close")} {onclose}>
  <div class="panel">
    {#if receipt}
      <!-- Le reçu : ticket au bord perforé, le seul moment animé du panneau. -->
      <div class="ticket" role="status">
        <p class="ticket-title">{format(t("admin.cash.done"), { number: receipt.number })}</p>
        <p class="ticket-who">{cash?.member.name} · {cash?.member.number}</p>
        <p class="ticket-amount">{currencies.length === 1 ? money(total, currencies[0]!) : ""}</p>
        <div class="ticket-actions">
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <Button href="{receiptBase}/{receipt.id}" variant="ink" data-sveltekit-reload
            >{t("admin.cash.download")}</Button
          >
          <Button variant="ghost" onclick={onreset}>{t("admin.cash.another")}</Button>
        </div>
      </div>
    {:else}
      <Lookup
        label={t("admin.cash.member")}
        type="members"
        name="memberLookup"
        placeholder={t("admin.cash.member.search")}
        emptyText={t("admin.cash.member.none")}
        initial={cash ? { id: cash.member.id, label: cash.member.name, context: cash.member.number } : null}
        onpick={(m) => m && onpick(m.id)}
      />

      {#if cash}
        <form
          method="POST"
          action="?/cash"
          use:enhance={() => {
            pending = true;
            return async ({ update }) => {
              await update({ reset: false, invalidateAll: false });
              pending = false;
            };
          }}
          class="stack"
        >
          <input type="hidden" name="memberId" value={cash.member.id} />
          <input type="hidden" name="clientRef" value={clientRef} />
          <input type="hidden" name="amount" value={total} />
          <input type="hidden" name="currency" value={currencies[0] ?? ""} />
          <fieldset>
            <legend>{t("admin.cash.obligations")}</legend>
            {#if cash.obligations.length === 0}
              <p class="muted">{t("admin.cash.obligations.none")}</p>
            {:else}
              <p class="muted">{t("admin.cash.obligations.hint")}</p>
              {#each cash.obligations as o (o.id)}
                <label class="ob" class:on={chosen.includes(o.id)}>
                  <input type="checkbox" name="obligationIds" value={o.id} bind:group={chosen} />
                  <span class="period">
                    <span class="month">{monthFmt.format(new Date(`${o.periodStart}T12:00:00Z`))}</span>
                    <span class="muted">{label(o.planName)}</span>
                  </span>
                  <span class="state {tone[o.state]}">{tk(`admin.sheet.dues.state.${o.state}`)}</span>
                  <span class="num">{money(o.amount, o.currency)}</span>
                </label>
              {/each}
            {/if}
          </fieldset>

          {#if currencies.length > 1}<p class="error" role="alert">{t("admin.cash.mixed")}</p>{/if}
          {#if error}<p class="error" role="alert">{error}</p>{/if}

          <div class="total">
            <span>{t("admin.cash.total")}</span>
            <strong>{currencies.length === 1 ? money(total, currencies[0]!) : "0"}</strong>
          </div>
          <Button type="submit" {pending} disabled={picked.length === 0 || currencies.length !== 1}>
            {t("admin.cash.submit")}
          </Button>
        </form>
      {/if}
    {/if}
  </div>
</SidePanel>

<style>
  .panel,
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  legend {
    padding: 0;
    margin-bottom: var(--s-1);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .muted {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .ob {
    min-height: 56px;
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-2) var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    cursor: pointer;
  }
  .ob.on {
    border-color: var(--c-primary);
    background: var(--c-primary-tint);
  }
  .ob:has(input:focus-visible) {
    box-shadow: var(--focus-ring);
  }
  .ob input {
    width: 18px;
    height: 18px;
    accent-color: var(--c-primary);
  }
  .period {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .month {
    font-weight: 600;
    text-transform: capitalize;
  }
  .state {
    padding: 2px 8px;
    border-radius: var(--r-pill);
    font-size: var(--fs-12);
    font-weight: 600;
    background: var(--c-paper);
    color: var(--c-ink-2);
  }
  .state.late {
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
  }
  .state.due {
    background: var(--c-warning-tint);
    color: var(--c-warning-text);
  }
  .num {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .error {
    margin: 0;
    padding: var(--s-3) var(--s-4);
    border-radius: var(--r-md);
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
    font-size: var(--fs-14);
  }
  .total {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: var(--s-4) var(--s-5);
    border-radius: var(--r-lg);
    background: var(--c-paper);
  }
  .total strong {
    font: 600 var(--fs-26) / 1.12 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  /* Ticket de caisse : bord perforé en bas, ligne pointillée avant le montant. */
  .ticket {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    padding: var(--s-6) var(--s-6) var(--s-8);
    border-radius: var(--r-md) var(--r-md) 0 0;
    background: var(--c-paper);
    border: 1px solid var(--c-line);
    border-bottom: 0;
    animation: print 0.5s var(--ease-stamp, ease-out) both;
  }
  .ticket::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -8px;
    height: 8px;
    background: radial-gradient(circle 5px at 8px 0, var(--c-paper) 98%, transparent) 0 0 / 16px 8px repeat-x;
  }
  @keyframes print {
    from {
      transform: translateY(-12px);
      opacity: 0;
    }
  }
  .ticket-title {
    margin: 0;
    font: 600 var(--fs-19) / 1.25 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .ticket-who {
    margin: 0;
    color: var(--c-ink-2);
  }
  .ticket-amount {
    margin: var(--s-3) 0;
    padding-top: var(--s-3);
    border-top: 1px dashed var(--c-ink-3);
    font: 600 var(--fs-40) / 1.12 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .ticket-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  @media (prefers-reduced-motion: reduce) {
    .ticket {
      animation: none;
    }
  }
</style>
