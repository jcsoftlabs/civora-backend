<!--
  Journal de la console (SOC-10) : chaque connexion et chaque action de l'équipe, en ajout seulement.
  Heures à l'heure d'Haïti, en AM/PM.
-->
<script lang="ts">
  import { resolve } from "$app/paths";
  import { formatDateTime } from "$lib/datetime";
  import { translator, type MessageKey } from "$lib/i18n";
  import type { PageData } from "./$types";

  let { data }: { data: PageData & { locale: "fr" | "ht" } } = $props();
  const t = $derived(translator(data.locale));
  const tk = (k: string) => t(k as MessageKey);
  const last = $derived(data.entries.at(-1));
</script>

<h1>{t("con.audit.title")}</h1>
<p class="lead">{t("con.audit.lead")}</p>

{#if data.entries.length === 0}
  <p class="empty">{t("con.audit.empty")}</p>
{:else}
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th scope="col">{t("con.audit.col.date")}</th>
          <th scope="col">{t("con.audit.col.who")}</th>
          <th scope="col">{t("con.audit.col.action")}</th>
          <th scope="col">{t("con.audit.col.org")}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.entries as e (e.id)}
          <tr>
            <td class="when">{formatDateTime(e.createdAt)}</td>
            <td>{e.staff ?? t("con.audit.system")}</td>
            <td>{tk(`con.a.${e.action}`)}</td>
            <td>
              {#if e.targetPartyId}
                <a href={resolve("/console/(app)/organisations/[id]", { id: e.targetPartyId })}>
                  {data.names[e.targetPartyId] ?? e.targetPartyId.slice(0, 8)}
                </a>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if data.entries.length === 100 && last}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a class="more" href="{resolve('/console/(app)/journal')}?avant={encodeURIComponent(last.createdAt)}"
      >{t("con.audit.more")}</a
    >
  {/if}
{/if}

<style>
  h1 {
    margin: 0;
    font: 600 var(--fs-32) / 1.1 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .lead {
    margin: var(--s-2) 0 var(--s-5);
    color: var(--c-ink-2);
  }
  .empty {
    padding: var(--s-8);
    border: 1px dashed var(--c-line);
    border-radius: var(--r-lg);
    color: var(--c-ink-2);
  }
  .scroll {
    overflow-x: auto;
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-14);
  }
  th,
  td {
    padding: var(--s-3) var(--s-4);
    text-align: left;
    border-bottom: 1px solid var(--c-line-soft);
    white-space: nowrap;
  }
  thead th {
    font-size: var(--fs-13);
    font-weight: 600;
    color: var(--c-ink-2);
  }
  .when {
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
  }
  td a {
    color: var(--c-ink);
    text-underline-offset: 3px;
  }
  .more {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    margin-top: var(--s-4);
    color: var(--c-primary);
    font-weight: 600;
  }
  td a:focus-visible,
  .more:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
