<!--
  Destinataires d'une publication ou d'une notification : zones (pastilles), statuts, lieu (Haïti ou diaspora),
  organes. Les choix partent en champs répétés du formulaire ; la portée est recalculée à chaque changement.
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import { resolve } from "$app/paths";
  import Lookup from "$lib/components/Lookup.svelte";
  import { format, translator } from "$lib/i18n";
  import type { StoredAudience } from "./audience";

  interface Props {
    locale: "fr" | "ht";
    purpose: "push" | "publication";
    statuses: Array<{ id: string; label: { fr: string; ht?: string } }>;
    organs: Array<{ id: string; name: string }>;
    initial?: StoredAudience | null;
    /** Noms des zones déjà choisies, par code. */
    zoneNames?: Record<string, string>;
  }
  let { locale, purpose, statuses, organs, initial = null, zoneNames = {} }: Props = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(locale, orgKind()));
  const label = (l: { fr: string; ht?: string }) => (locale === "ht" && l.ht ? l.ht : l.fr);

  let zones = $derived<Array<{ code: string; name: string }>>(
    (initial?.zoneCodes ?? []).map((code) => ({ code, name: zoneNames[code] ?? code })),
  );
  let statusIds = $derived<string[]>([...(initial?.statusIds ?? [])]);
  let organIds = $derived<string[]>([...(initial?.organIds ?? [])]);
  let place = $derived(initial?.diaspora === undefined ? "" : String(initial.diaspora));
  let lookupKey = $state(0);

  let estimate = $state<{ members: number; reachable: number } | null>(null);
  let error = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const audience = {
      ...(zones.length ? { zoneCodes: zones.map((z) => z.code) } : {}),
      ...(statusIds.length ? { statusIds } : {}),
      ...(organIds.length ? { organIds } : {}),
      ...(place ? { diaspora: place === "true" } : {}),
    };
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const res = await fetch(resolve("/admin/communication/portee"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audience: Object.keys(audience).length ? audience : null, for: purpose }),
      });
      const body = (await res.json().catch(() => ({}))) as { members?: number; reachable?: number; code?: string };
      if (res.ok) {
        estimate = { members: body.members ?? 0, reachable: body.reachable ?? 0 };
        error = null;
      } else {
        estimate = null;
        error = body.code ?? "generic";
      }
    }, 250);
  });
</script>

<fieldset class="audience">
  <legend>{t("admin.audience.title")}</legend>
  <p class="muted">{t("admin.audience.lead")}</p>

  <div class="block">
    <p class="label">{t("admin.audience.zones")}</p>
    {#if zones.length}
      <ul class="chips">
        {#each zones as z (z.code)}
          <li>
            <input type="hidden" name="zoneCodes" value={z.code} />
            <span>{z.name}</span>
            <button
              type="button"
              aria-label={format(t("admin.audience.removeZone"), { zone: z.name })}
              onclick={() => (zones = zones.filter((x) => x.code !== z.code))}>×</button
            >
          </li>
        {/each}
      </ul>
    {/if}
    {#key lookupKey}
      <Lookup
        label={t("admin.audience.addZone")}
        type="zones"
        name="_zone"
        placeholder={t("admin.organ.zone.search")}
        emptyText={t("error.zone_not_found")}
        onpick={(z) => {
          if (z && !zones.some((x) => x.code === z.id)) zones = [...zones, { code: z.id, name: z.label }];
          lookupKey++;
        }}
      />
    {/key}
  </div>

  {#if statuses.length}
    <div class="block">
      <p class="label">{t("admin.audience.statuses")}</p>
      <div class="checks">
        {#each statuses as s (s.id)}
          <label class="check" class:on={statusIds.includes(s.id)}>
            <input type="checkbox" name="statusIds" value={s.id} bind:group={statusIds} />
            <span>{label(s.label)}</span>
          </label>
        {/each}
      </div>
    </div>
  {/if}

  <label class="block select">
    <span class="label">{t("admin.audience.place")}</span>
    <select name="diaspora" bind:value={place}>
      <option value="">{t("admin.audience.place.any")}</option>
      <option value="false">{t("admin.com.audience.haiti")}</option>
      <option value="true">{t("admin.com.audience.diaspora")}</option>
    </select>
  </label>

  {#if organs.length}
    <div class="block">
      <p class="label">{t("admin.audience.organs")}</p>
      <div class="checks">
        {#each organs as o (o.id)}
          <label class="check" class:on={organIds.includes(o.id)}>
            <input type="checkbox" name="organIds" value={o.id} bind:group={organIds} />
            <span>{o.name}</span>
          </label>
        {/each}
      </div>
    </div>
  {/if}

  <p class="estimate" class:bad={!!error} role="status" aria-live="polite">
    {#if error}
      {t(`error.${error}` as Parameters<typeof t>[0])}
    {:else if estimate}
      {purpose === "push"
        ? format(t("admin.audience.estimate"), { n: String(estimate.members), m: String(estimate.reachable) })
        : format(t("admin.audience.estimate.pub"), { n: String(estimate.members) })}
    {:else}
      {t("admin.audience.estimating")}
    {/if}
  </p>
</fieldset>

<style>
  .audience {
    margin: 0;
    padding: var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  legend {
    padding: 0 var(--s-2);
    font: 600 var(--fs-15) / 1.2 var(--font-display);
  }
  .muted {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .label {
    margin: 0;
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .chips {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1);
  }
  .chips li {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding-left: var(--s-3);
    border-radius: var(--r-pill);
    background: var(--c-primary-tint);
    font-size: var(--fs-13);
    font-weight: 600;
  }
  .chips button {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--c-ink);
    font-size: var(--fs-16);
    cursor: pointer;
  }
  .checks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .check {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    font-size: var(--fs-14);
    cursor: pointer;
  }
  .check.on {
    border-color: var(--c-primary);
    background: var(--c-primary-tint);
  }
  .check input {
    accent-color: var(--c-primary);
  }
  .check:has(input:focus-visible),
  .chips button:focus-visible,
  select:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  select {
    min-height: 44px;
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1 var(--font-ui);
  }
  .estimate {
    margin: 0;
    padding: var(--s-3) var(--s-4);
    border-radius: var(--r-md);
    background: var(--c-accent-tint);
    color: var(--c-on-accent);
    font-size: var(--fs-14);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .estimate.bad {
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
  }
</style>
