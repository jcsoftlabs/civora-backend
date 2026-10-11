<!--
  Votes internes (VOT-01 à VOT-10) : chaque scrutin est un bulletin, avec son bord prédécoupé, son étape, son
  calendrier et, une fois la liste figée, la participation (votants sur inscrits). Hors formule : option verrouillée.
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import { resolve } from "$app/paths";
  import { Badge, Locked } from "@civora/ui";
  import { formatDayTime } from "$lib/datetime";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { PageData } from "./$types";
  import type { Phase } from "./+page.server";

  let { data }: { data: PageData & { locale: "fr" | "ht" } } = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(data.locale, orgKind()));
  const tk = (k: string) => t(k as MessageKey);
  const label = (l: { fr: string; ht?: string }) => (data.locale === "ht" && l.ht ? l.ht : l.fr);
  const TONE: Record<Phase, "neutral" | "primary" | "success" | "warning" | "accent"> = {
    draft: "neutral",
    preparation: "primary",
    open: "success",
    counting: "warning",
    closed: "primary",
    published: "accent",
  };
</script>

<main>
  <header class="head">
    <div>
      <p class="crumb">{data.party.name}</p>
      <h1>{t("vot.title")}</h1>
    </div>
    {#if !data.locked}
      <a class="primary" href={resolve("/admin/votes/nouveau")}>{t("vot.create")}</a>
    {/if}
  </header>

  {#if data.locked}
    <Locked title={t("vot.title")} message={format(t("plan.lockedIn"), { tier: tk(`plan.${data.locked}`) })} />
  {:else if data.elections.length === 0}
    <section class="empty">
      <h2>{t("vot.empty.title")}</h2>
      <p>{t("vot.empty.lead")}</p>
      <a class="primary" href={resolve("/admin/votes/nouveau")}>{t("vot.create")}</a>
    </section>
  {:else}
    <ul class="list">
      {#each data.elections as e (e.id)}
        {@const share = e.registered ? Math.round((e.voted / e.registered) * 100) : 0}
        <li>
          <a
            class="ballot"
            class:draft={e.phase === "draft"}
            href={resolve("/admin/(app)/votes/[id]", { id: e.id })}
            aria-label={format(t("vot.open"), { title: label(e.title) })}
          >
            <span class="stub" aria-hidden="true"></span>
            <span class="body">
              <span class="top">
                <Badge tone={TONE[e.phase]}>{tk(`vot.phase.${e.phase}`)}</Badge>
                {#if e.round === 2}<Badge tone="warning">{t("vot.round2")}</Badge>{/if}
                <span class="meta">{tk(`vot.kind.${e.kind}`)}, {e.zoneName ?? t("vot.national")}</span>
              </span>
              <span class="name">{label(e.title)}</span>
              <span class="dates">
                {format(t("vot.dates"), { opens: formatDayTime(e.opensAt), closes: formatDayTime(e.closesAt) })}
              </span>
              {#if e.phase !== "draft"}
                <span class="turnout">
                  <span class="bar" aria-hidden="true"><span style:width="{share}%"></span></span>
                  <span class="figures">
                    {format(t("vot.participation"), { voted: String(e.voted), registered: String(e.registered) })}
                    <strong>{share} %</strong>
                  </span>
                </span>
              {/if}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
    padding: var(--s-6) var(--s-8) var(--s-10);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--s-4);
  }
  .crumb {
    margin: 0 0 var(--s-2);
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  h1 {
    margin: 0;
    font: 600 var(--fs-32) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .primary {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    padding: 0 var(--s-5);
    border-radius: var(--r-pill);
    background: var(--c-primary);
    color: var(--c-on-primary);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    text-decoration: none;
  }
  .primary:focus-visible,
  .ballot:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .empty {
    max-width: 600px;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-8);
    border: 1px dashed var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  .empty h2 {
    margin: 0;
    font: 600 var(--fs-22) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .empty p {
    margin: 0;
    color: var(--c-ink-2);
    line-height: 1.5;
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: var(--s-4);
  }
  /* Bulletin : talon prédécoupé à gauche, comme un bulletin papier qu'on détache. */
  .ballot {
    height: 100%;
    display: flex;
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
    color: var(--c-ink);
    text-decoration: none;
    overflow: hidden;
  }
  .ballot:hover {
    border-color: var(--c-ink-3);
  }
  .ballot.draft {
    border-style: dashed;
  }
  .stub {
    position: relative;
    flex: 0 0 22px;
    background: var(--c-paper);
    border-right: 2px dashed var(--c-line);
  }
  .stub::before,
  .stub::after {
    content: "";
    position: absolute;
    left: 6px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--c-surface);
    border: 1px solid var(--c-line);
  }
  .stub::before {
    top: 18px;
  }
  .stub::after {
    bottom: 18px;
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    padding: var(--s-4) var(--s-5);
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2);
  }
  .meta {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .name {
    font: 600 var(--fs-19) / 1.25 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .dates {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .turnout {
    margin-top: auto;
    padding-top: var(--s-3);
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    border-top: 1px solid var(--c-line-soft);
  }
  .bar {
    height: 6px;
    border-radius: var(--r-pill);
    background: var(--c-line-soft);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: var(--r-pill);
    background: var(--c-primary);
  }
  .figures {
    display: flex;
    justify-content: space-between;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
  }
  .figures strong {
    color: var(--c-ink);
  }
  @media (max-width: 760px) {
    main {
      padding: var(--s-5) var(--s-4) var(--s-8);
    }
    .list {
      grid-template-columns: 1fr;
    }
  }
</style>
