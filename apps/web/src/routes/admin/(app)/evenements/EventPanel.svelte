<!--
  Événement (ENG-03) : type, titre et présentation en français et en créole, début et fin, zone et organe
  (fixés à la création, ils décident qui voit l'événement), lieu, nombre de places. Puis la liste des inscrits.
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import { partyFormat } from "$lib/datetime";
  import { enhance } from "$app/forms";
  import { Button, Field, SidePanel } from "@civora/ui";
  import Lookup from "$lib/components/Lookup.svelte";
  import DateTimeField from "$lib/components/DateTimeField.svelte";
  import { toPartyLocal } from "$lib/datetime";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { ManagedEvent, Registrant } from "./+page.server";

  interface Props {
    event: ManagedEvent | null;
    registrants: Registrant[];
    organs: Array<{ id: string; name: string; zoneCode: string | null }>;
    locale: "fr" | "ht";
    form: { ok?: boolean; done?: string; code?: string } | null;
    onclose: () => void;
  }
  let { event: e, registrants, organs, locale, form, onclose }: Props = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(locale, orgKind()));
  const tk = (k: string) => t(k as MessageKey);

  let open = $state(true);
  let pending = $state(false);
  let kind = $derived(e?.kind ?? "rassemblement");
  const KINDS = ["rassemblement", "reunion", "congres", "formation"] as const;
  const dtLabels = $derived({ date: t("common.date"), hour: t("common.hour"), minute: t("common.minute") });
  const dateFmt = $derived(partyFormat({ day: "numeric", month: "short" }));
  const message = $derived(
    form?.code
      ? { bad: true, text: tk(`error.${form.code}`) }
      : form?.ok && form.done
        ? { bad: false, text: tk(`admin.event.${form.done}`) }
        : null,
  );
</script>

<SidePanel
  bind:open
  title={e ? `${t("admin.event.edit")} : ${e.title.fr}` : t("admin.event.new")}
  closeLabel={t("admin.sheet.close")}
  {onclose}
>
  <form
    method="POST"
    action={e ? "?/update" : "?/create"}
    use:enhance={() => {
      pending = true;
      return async ({ update }) => {
        await update({ reset: false });
        pending = false;
      };
    }}
    class="stack"
  >
    {#if message}<p class="msg" class:bad={message.bad} role="status">{message.text}</p>{/if}
    {#if e}<input type="hidden" name="id" value={e.id} />{/if}

    {#if !e}
      <fieldset class="kinds">
        <legend>{t("admin.event.kind")}</legend>
        {#each KINDS as k (k)}
          <label class:on={kind === k}>
            <input type="radio" name="kind" value={k} bind:group={kind} />
            <span>{tk(`admin.events.kind.${k}`)}</span>
          </label>
        {/each}
      </fieldset>
    {/if}

    <Field label={t("admin.event.title")} name="titleFr" required maxlength={160} value={e?.title.fr ?? ""} />
    <Field label={t("admin.event.titleHt")} name="titleHt" maxlength={160} value={e?.title.ht ?? ""} />
    <DateTimeField
      label={t("admin.event.starts")}
      name="startsAt"
      required
      value={toPartyLocal(e?.startsAt)}
      labels={dtLabels}
    />
    <DateTimeField
      label={t("admin.event.ends")}
      name="endsAt"
      required
      value={toPartyLocal(e?.endsAt)}
      labels={dtLabels}
    />
    <Field
      label={t("admin.event.address")}
      hint={t("admin.event.address.hint")}
      name="address"
      maxlength={300}
      value={e?.address ?? ""}
    />
    <Field
      label={t("admin.event.capacity")}
      hint={t("admin.event.capacity.hint")}
      name="capacity"
      type="number"
      min="1"
      inputmode="numeric"
      value={e?.capacity ? String(e.capacity) : ""}
    />

    {#if e}
      <p class="muted">
        {t("admin.event.zone")} : <strong>{e.zoneName ?? t("admin.events.national")}</strong>
        {#if e.organName}· {e.organName}{/if}. {t("admin.event.fixed")}
      </p>
    {:else}
      <Lookup
        label={t("admin.event.zone")}
        hint={t("admin.event.zone.hint")}
        type="zones"
        name="zoneCode"
        placeholder={t("admin.organ.zone.search")}
        emptyText={t("error.zone_not_found")}
        clearLabel={t("admin.events.national")}
      />
      {#if organs.length}
        <label class="area">
          <span>{t("admin.event.organ")}</span>
          <select name="organId">
            <option value="">{t("admin.event.organ.none")}</option>
            {#each organs as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
          </select>
        </label>
      {/if}
    {/if}

    <label class="area">
      <span>{t("admin.event.description")}</span>
      <textarea name="descriptionFr" rows="4" maxlength="5000">{e?.description?.fr ?? ""}</textarea>
    </label>
    <label class="area">
      <span>{t("admin.event.descriptionHt")}</span>
      <textarea name="descriptionHt" rows="4" maxlength="5000">{e?.description?.ht ?? ""}</textarea>
    </label>

    <div class="row end">
      <Button variant="ghost" onclick={() => (open = false)}>{t("common.cancel")}</Button>
      <Button type="submit" {pending}>{e ? t("admin.event.save") : t("admin.events.create")}</Button>
    </div>
  </form>

  {#if e}
    <section class="registrants" aria-labelledby="reg-title">
      <h3 id="reg-title">
        {t("admin.event.registrants")}
        <span class="n">{e.capacity ? `${registrants.length} / ${e.capacity}` : registrants.length}</span>
      </h3>
      {#if registrants.length === 0}
        <p class="muted">{t("admin.event.registrants.none")}</p>
      {:else}
        <ol>
          {#each registrants as r (r.memberId)}
            <li>
              <span class="avatar" aria-hidden="true">{r.firstName[0]}{r.lastName[0]}</span>
              <span class="who">
                <span>{r.firstName} {r.lastName}</span>
                <span class="muted">
                  {r.memberNumber} · {format(t("admin.event.registeredOn"), {
                    date: dateFmt.format(new Date(r.registeredAt)),
                  })}
                </span>
              </span>
            </li>
          {/each}
        </ol>
      {/if}
    </section>
  {/if}
</SidePanel>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .kinds {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  legend {
    width: 100%;
    padding: 0;
    margin-bottom: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .kinds label {
    position: relative;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    font-size: var(--fs-14);
    cursor: pointer;
  }
  .kinds input {
    position: absolute;
    opacity: 0;
  }
  .kinds label.on {
    border-color: var(--c-ink);
    background: var(--c-ink);
    color: var(--c-surface);
  }
  .area {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
  }
  textarea,
  select {
    min-height: 44px;
    padding: var(--s-2) var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 400 var(--fs-15) / 1.4 var(--font-ui);
  }
  textarea {
    resize: vertical;
  }
  .kinds label:has(input:focus-visible),
  textarea:focus-visible,
  select:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .row.end {
    justify-content: flex-end;
  }
  .muted {
    margin: 0;
    font-size: var(--fs-13);
    font-weight: 400;
    color: var(--c-ink-2);
    line-height: 1.45;
  }
  .msg {
    margin: 0;
    padding: var(--s-3) var(--s-4);
    border-radius: var(--r-md);
    background: var(--c-success-tint);
    color: var(--c-success-text);
    font-size: var(--fs-14);
  }
  .msg.bad {
    background: var(--c-danger-tint);
    color: var(--c-danger-text);
  }
  .registrants {
    margin-top: var(--s-6);
    padding-top: var(--s-5);
    border-top: 1px solid var(--c-line);
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  h3 {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: var(--s-2);
    font: 600 var(--fs-19) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .n {
    font: 600 var(--fs-14) / 1 var(--font-ui);
    color: var(--c-ink-2);
    font-variant-numeric: tabular-nums;
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  ol li {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-2) 0;
    border-bottom: 1px solid var(--c-line-soft);
  }
  .avatar {
    flex: none;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--c-primary-tint);
    color: var(--c-primary-deep);
    font: 600 var(--fs-12) / 1.12 var(--font-display);
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-weight: 600;
  }
</style>
