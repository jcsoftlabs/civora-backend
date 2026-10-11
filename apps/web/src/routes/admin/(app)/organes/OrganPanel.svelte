<!--
  Panneau latéral d'un organe (ORG-01 à ORG-04, maquette « Back-office : organes ») : identité de l'organe,
  postes et titulaires, nomination d'un successeur (les droits suivent le poste), fin de mandat, nouveau poste.
  « Mode simple » masque les droits détaillés des postes. Sans organe : création d'un organe.
-->
<script lang="ts">
  import { partyFormat } from "$lib/datetime";
  import { enhance } from "$app/forms";
  import { Badge, Button, Field, SidePanel, Switch } from "@civora/ui";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import Lookup from "$lib/components/Lookup.svelte";
  import type { Organ, Post } from "./+page.server";

  interface Props {
    organ: Organ | null;
    posts: Post[];
    organs: Organ[];
    groups: Array<{ group: string; perms: string[] }>;
    permissions: string[];
    locale: "fr" | "ht";
    form: { ok?: boolean; done?: string; code?: string } | null;
    onclose: () => void;
  }
  let { organ, posts, organs, groups, permissions, locale, form, onclose }: Props = $props();
  const t = $derived(translator(locale));
  const tk = (k: string) => t(k as MessageKey);

  let open = $state(true);
  let simple = $state(false);
  let pending = $state(false);
  let assigning = $state<string | null>(null);
  let replace = $state(true);
  let ending = $state<string | null>(null);
  let chosenPerms = $state<string[]>([]);
  const canAssign = $derived(permissions.includes("posts.assign"));
  const KINDS = ["bureau", "coordination", "section", "commission", "antenne"] as const;
  const dateFmt = $derived(partyFormat({ day: "numeric", month: "long", year: "numeric" }));
  const message = $derived(
    form?.code
      ? { bad: true, text: tk(`error.${form.code}`) }
      : form?.ok
        ? { bad: false, text: tk(`admin.organ.${form.done}`) }
        : null,
  );

  const submit = () => {
    pending = true;
    return async ({
      update,
      result,
    }: {
      update: (o?: { reset?: boolean }) => Promise<void>;
      result: { type: string };
    }) => {
      await update({ reset: result.type === "success" });
      pending = false;
      if (result.type === "success") {
        assigning = null;
        ending = null;
        chosenPerms = [];
      }
    };
  };
</script>

<datalist id="organ-kinds">
  {#each KINDS as k (k)}<option value={tk(`admin.organ.kind.${k}`)}></option>{/each}
</datalist>

<SidePanel
  bind:open
  bind:simpleMode={simple}
  title={organ ? format(t("admin.organ.panel"), { name: organ.name }) : t("admin.organ.new")}
  closeLabel={t("admin.sheet.close")}
  simpleModeLabel={organ ? t("admin.organ.simple") : undefined}
  {onclose}
>
  <div class="panel">
    {#if message}<p class="msg" class:bad={message.bad} role="status">{message.text}</p>{/if}

    <form method="POST" action={organ ? "?/update" : "?/create"} use:enhance={submit} class="stack">
      {#if organ}<input type="hidden" name="id" value={organ.id} />{/if}
      <Field
        label={t("admin.organ.name")}
        name="name"
        required
        minlength={2}
        maxlength={120}
        value={organ?.name ?? ""}
      />
      <Field
        label={t("admin.organ.kind")}
        hint={t("admin.organ.kind.hint")}
        name="kind"
        required
        minlength={2}
        list="organ-kinds"
        value={organ?.kind ?? ""}
      />
      <Lookup
        label={t("admin.organ.zone")}
        hint={t("admin.organ.zone.hint")}
        type="zones"
        name="zoneCode"
        placeholder={t("admin.organ.zone.search")}
        emptyText={t("error.zone_not_found")}
        clearLabel={organ ? undefined : t("admin.organ.zone.clear")}
        initial={organ?.zoneCode
          ? { id: organ.zoneCode, label: organ.zoneName ?? organ.zoneCode, context: null }
          : null}
      />
      {#if !organ}
        <label class="select">
          <span>{t("admin.organ.parent")}</span>
          <select name="parentOrganId">
            <option value="">{t("admin.organ.parent.none")}</option>
            {#each organs as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
          </select>
        </label>
      {/if}
      <div class="row end">
        <Button type="submit" {pending}>{organ ? t("common.save") : t("admin.organs.create")}</Button>
      </div>
    </form>

    {#if organ}
      <section class="posts" aria-labelledby="posts-title">
        <h3 id="posts-title">{t("admin.organ.posts")}</h3>
        {#if posts.length === 0}
          <p class="muted">{t("admin.organ.posts.empty")}</p>
        {/if}
        <ul>
          {#each posts as p (p.id)}
            <li class="post" class:vacant={p.holders.length === 0}>
              <div class="post-head">
                <strong>{p.title}</strong>
                {#if !simple}
                  <Badge>{format(t("admin.organ.permissionsCount"), { n: String(p.permissions.length) })}</Badge>
                {/if}
              </div>
              {#if !simple && p.permissions.length}
                <p class="perms">{p.permissions.map((x) => tk(`perm.${x}`)).join(", ")}</p>
              {/if}
              {#if p.holders.length === 0}
                <p class="vacant-label">{t("admin.organ.vacantPost")}</p>
              {/if}
              {#each p.holders as h (h.id)}
                <div class="holder">
                  <span class="avatar" aria-hidden="true">{h.firstName[0]}{h.lastName[0]}</span>
                  <span class="who">
                    <span>{h.firstName} {h.lastName}</span>
                    <span class="muted"
                      >{format(t("admin.organ.holderSince"), { date: dateFmt.format(new Date(h.startsAt)) })}</span
                    >
                  </span>
                  {#if canAssign}
                    {#if ending === h.id}
                      <form method="POST" action="?/endHolder" use:enhance={submit}>
                        <input type="hidden" name="postId" value={p.id} />
                        <input type="hidden" name="holderId" value={h.id} />
                        <Button type="submit" size="sm" variant="ink" {pending}>
                          {format(t("admin.organ.endTerm.confirm"), { name: h.firstName })}
                        </Button>
                      </form>
                    {:else}
                      <Button size="sm" variant="ghost" onclick={() => (ending = h.id)}
                        >{t("admin.organ.endTerm")}</Button
                      >
                    {/if}
                  {/if}
                </div>
              {/each}
              {#if canAssign}
                {#if assigning === p.id}
                  <form method="POST" action="?/assign" use:enhance={submit} class="stack assign">
                    <input type="hidden" name="postId" value={p.id} />
                    <input type="hidden" name="replaceCurrent" value={String(replace)} />
                    <Lookup
                      label={t("admin.organ.assign")}
                      type="members"
                      name="memberId"
                      within={organ.zoneCode}
                      placeholder={t("admin.organ.assign.search")}
                      emptyText={t("admin.organ.assign.none")}
                    />
                    {#if p.holders.length}
                      <Switch
                        label={t("admin.organ.assign.replace")}
                        description={t("admin.organ.assign.replace.hint")}
                        onLabel={t("common.yes")}
                        offLabel={t("common.no")}
                        bind:checked={replace}
                      />
                    {/if}
                    <div class="row">
                      <Button type="submit" size="sm" {pending}>{t("admin.organ.assign")}</Button>
                      <Button size="sm" variant="ghost" onclick={() => (assigning = null)}>{t("common.cancel")}</Button>
                    </div>
                  </form>
                {:else}
                  <Button size="sm" variant="secondary" onclick={() => ((assigning = p.id), (replace = true))}>
                    {t("admin.organ.assign")}
                  </Button>
                {/if}
              {/if}
            </li>
          {/each}
        </ul>

        <form method="POST" action="?/addPost" use:enhance={submit} class="stack add" id="add-post">
          <h3>{t("admin.organ.addPost")}</h3>
          <input type="hidden" name="id" value={organ.id} />
          <Field
            label={t("admin.organ.postTitle")}
            hint={t("admin.organ.postTitle.hint")}
            name="title"
            required
            minlength={2}
            maxlength={120}
          />
          {#if !simple}
            <fieldset>
              <legend>{t("admin.organ.permissions")}</legend>
              <p class="muted">{t("admin.organ.permissions.hint")}</p>
              {#each groups as g (g.group)}
                <div class="group">
                  <p class="group-title">{tk(`perm.group.${g.group}`)}</p>
                  {#each g.perms as perm (perm)}
                    <label class="check">
                      <input type="checkbox" name="permissions" value={perm} bind:group={chosenPerms} />
                      <span>{tk(`perm.${perm}`)}</span>
                    </label>
                  {/each}
                </div>
              {/each}
            </fieldset>
          {/if}
          <div class="row end">
            <Button type="submit" {pending}>{t("admin.organ.addPost")}</Button>
          </div>
        </form>
      </section>
    {/if}
  </div>
</SidePanel>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--s-6);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .row.end {
    justify-content: flex-end;
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
  h3 {
    margin: 0;
    font: 700 var(--fs-19) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .select {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    font-size: var(--fs-14);
    font-weight: 600;
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
  .posts {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding-top: var(--s-5);
    border-top: 1px solid var(--c-line);
  }
  .posts ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  .post {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--s-3);
    padding: var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
  }
  .post.vacant {
    border-style: dashed;
    border-color: var(--c-warning);
  }
  .post-head {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
  }
  .perms {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    line-height: 1.45;
  }
  .vacant-label {
    margin: 0;
    font-size: var(--fs-13);
    font-weight: 600;
    color: var(--c-warning-text);
  }
  .holder {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--s-3);
  }
  /* Responsable cerclé d'ambre, comme sur la grille. */
  .avatar {
    flex: none;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--c-primary-tint);
    color: var(--c-primary-deep);
    font: 700 var(--fs-13) / 1 var(--font-display);
    box-shadow:
      0 0 0 2px var(--c-surface),
      0 0 0 4px var(--c-accent);
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-weight: 600;
  }
  .muted {
    margin: 0;
    font-size: var(--fs-13);
    font-weight: 400;
    color: var(--c-ink-2);
  }
  .assign {
    width: 100%;
  }
  .add {
    padding-top: var(--s-5);
    border-top: 1px solid var(--c-line);
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  legend {
    padding: 0;
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .group-title {
    margin: var(--s-2) 0 var(--s-1);
    font: 700 var(--fs-13) / 1.2 var(--font-ui);
    color: var(--c-ink-2);
  }
  .check {
    min-height: 40px;
    display: flex;
    align-items: center;
    gap: var(--s-3);
    font-size: var(--fs-14);
    cursor: pointer;
  }
  .check input {
    width: 18px;
    height: 18px;
    accent-color: var(--c-primary);
  }
</style>
