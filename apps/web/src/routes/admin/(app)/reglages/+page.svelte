<!--
  Réglages du parti (SOC-01, SOC-03, ADH-03, ADH-04, SOC-07) : identité visuelle, langues, mode d'adhésion,
  statuts de membre. À droite, la carte de membre se recompose en direct avec le nom, le logo et les couleurs :
  le seul moment animé de l'écran (le reflet passe à chaque nouvelle couleur).
  Les langues au-delà de la formule restent visibles, verrouillées, avec la formule qui les ouvre.
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import { enhance } from "$app/forms";
  import { env } from "$env/dynamic/public";
  import { ORGANIZATION_KINDS, PLANS, TIERS } from "@civora/shared";
  import { Badge, Button, Field, MemberCard, Switch } from "@civora/ui";
  import BrandColors from "$lib/components/BrandColors.svelte";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData & { locale: "fr" | "ht" }; form: ActionData } = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(data.locale, orgKind()));
  const tk = (k: string) => t(k as MessageKey);
  const st = $derived(data.settings);

  // Brouillon : suit les réglages enregistrés (rechargés après chaque enregistrement), modifiable entre-temps.
  let name = $derived(st.name);
  let color = $derived(st.brandColor);
  let secondary = $derived<string | null>(st.brandColorSecondary);
  let languages = $derived<string[]>([...st.languages]);
  let admission = $derived<string>(st.admissionMode);
  let kindDraft = $derived<string>(st.kind);

  const LANGS = ["fr", "ht", "en", "es"] as const;
  const MODES = ["libre", "validation", "parrainage"] as const;
  /** Formule la moins chère qui ouvre `n` langues. */
  const tierFor = (n: number) => TIERS.find((x) => PLANS[x].quotas.siteLanguages >= n);
  const full = $derived(languages.length >= st.siteLanguagesQuota);

  let pending = $state<string | null>(null);
  let editing = $state<string | null>(null);
  let logoName = $state("");
  const submit = (key: string) => () => {
    pending = key;
    return async ({
      update,
      result,
    }: {
      update: (o?: { reset?: boolean }) => Promise<void>;
      result: { type: string };
    }) => {
      await update({ reset: false });
      pending = null;
      if (result.type === "success") {
        editing = null;
        logoName = "";
      }
    };
  };
  const f = $derived(form as { ok?: boolean; done?: string; code?: string; requiredTier?: string } | null);
  const message = $derived(
    f?.code
      ? { bad: true, text: tk(`error.${f.code}`) }
      : f?.ok
        ? { bad: false, text: tk(`admin.settings.saved.${f.done}`) }
        : null,
  );
  const SECTIONS = ["identity", "kind", "languages", "admission", "engagement", "statuses"] as const;
  const eng = $derived(data.engagement);
  let referral = $derived(eng.referralEnabled);
  const ACTIONS = ["referral", "training", "vote", "dues", "attendance"] as const;
</script>

<div class="layout">
  <nav class="toc" aria-label={t("admin.settings.sections")}>
    <p class="toc-title">{t("admin.settings.title")}</p>
    <ul>
      {#each SECTIONS as s (s)}
        <li><a href="#{s}">{tk(`admin.settings.${s}`)}</a></li>
      {/each}
    </ul>
  </nav>

  <main>
    <header>
      <p class="crumb">{st.name}</p>
      <h1>{t("admin.settings.title")}</h1>
    </header>

    {#if message}<p class="msg" class:bad={message.bad} role="status">{message.text}</p>{/if}

    <section id="identity" aria-labelledby="identity-title">
      <h2 id="identity-title">{t("admin.settings.identity")}</h2>
      <p class="lead">{t("admin.settings.identity.lead")}</p>

      <form method="POST" action="?/identity" use:enhance={submit("identity")} class="stack">
        <Field label={t("admin.settings.name")} name="name" required minlength={2} maxlength={120} bind:value={name} />
        <p class="address">
          <span>{t("admin.settings.address")}</span>
          <strong>{st.slug}.{env.PUBLIC_ROOT_DOMAIN || "civora.app"}</strong>
        </p>
        <BrandColors bind:color bind:secondary locale={data.locale} />
        <input type="hidden" name="brandColor" value={color} />
        <input type="hidden" name="brandColorSecondary" value={secondary ?? ""} />
        <div class="row end">
          <Button type="submit" pending={pending === "identity"}>{t("admin.settings.saveIdentity")}</Button>
        </div>
      </form>

      <div class="logo-block">
        <p class="label">{t("admin.settings.logo")}</p>
        <div class="logo-row">
          {#if st.logoUrl}
            <img src={st.logoUrl} alt="" class="logo" />
          {:else}
            <p class="muted">{t("admin.settings.logo.none")}</p>
          {/if}
          <form
            method="POST"
            action="?/logo"
            enctype="multipart/form-data"
            use:enhance={submit("logo")}
            class="logo-form"
          >
            <label class="file">
              <input
                type="file"
                name="logo"
                accept="image/png,image/jpeg,image/webp"
                required
                onchange={(e) => (logoName = e.currentTarget.files?.[0]?.name ?? "")}
              />
              <span>{st.logoUrl ? t("admin.settings.logo.replace") : t("admin.settings.logo.choose")}</span>
            </label>
            {#if logoName}
              <span class="muted">{logoName}</span>
              <Button type="submit" size="sm" pending={pending === "logo"}>{t("common.save")}</Button>
            {/if}
          </form>
          {#if st.logoUrl}
            <form method="POST" action="?/removeLogo" use:enhance={submit("removeLogo")}>
              <Button type="submit" size="sm" variant="ghost" pending={pending === "removeLogo"}>
                {t("admin.settings.logo.remove")}
              </Button>
            </form>
          {/if}
        </div>
        <p class="muted">{t("admin.settings.logo.hint")}</p>
      </div>
    </section>

    <section id="kind" aria-labelledby="kind-title">
      <h2 id="kind-title">{t("admin.settings.kind")}</h2>
      <p class="lead">{t("admin.settings.kind.lead")}</p>
      <form method="POST" action="?/kind" use:enhance={submit("kind")} class="stack">
        <div class="modes">
          {#each ORGANIZATION_KINDS as k (k)}
            <label class="mode" class:on={kindDraft === k}>
              <input type="radio" name="kind" value={k} bind:group={kindDraft} />
              <span class="mode-name">{tk(`create.kind.${k}`)}</span>
              <span class="mode-desc">{tk(`create.kind.${k}.hint`)}</span>
            </label>
          {/each}
        </div>
        <div class="row end">
          <Button type="submit" pending={pending === "kind"} disabled={kindDraft === st.kind}>
            {t("admin.settings.saveKind")}
          </Button>
        </div>
      </form>
    </section>

    <section id="languages" aria-labelledby="languages-title">
      <h2 id="languages-title">{t("admin.settings.languages")}</h2>
      <p class="lead">{t("admin.settings.languages.lead")}</p>
      <form method="POST" action="?/languages" use:enhance={submit("languages")} class="stack">
        <p class="quota">
          {format(t("admin.settings.languages.quota"), {
            n: String(st.siteLanguagesQuota),
            tier: tk(`plan.${st.tier}`),
          })}
        </p>
        <div class="langs">
          {#each LANGS as l (l)}
            {@const on = languages.includes(l)}
            {@const locked = !on && full}
            <label class="lang" class:on class:locked>
              <input type="checkbox" name="languages" value={l} bind:group={languages} disabled={locked} />
              <span class="lang-name">{tk(`lang.${l}`)}</span>
              {#if locked && tierFor(languages.length + 1)}
                <span class="lock">
                  {format(t("plan.lockedIn"), { tier: tk(`plan.${tierFor(languages.length + 1)}`) })}
                </span>
              {/if}
            </label>
          {/each}
        </div>
        <div class="row end">
          <Button type="submit" pending={pending === "languages"} disabled={languages.length === 0}>
            {t("admin.settings.saveLanguages")}
          </Button>
        </div>
      </form>
    </section>

    <section id="admission" aria-labelledby="admission-title">
      <h2 id="admission-title">{t("admin.settings.admission")}</h2>
      <p class="lead">{t("admin.settings.admission.lead")}</p>
      <form method="POST" action="?/admission" use:enhance={submit("admission")} class="stack">
        <div class="modes">
          {#each MODES as m (m)}
            <label class="mode" class:on={admission === m}>
              <input type="radio" name="admissionMode" value={m} bind:group={admission} />
              <span class="mode-name">{tk(`admin.settings.admission.${m}`)}</span>
              <span class="mode-desc">{tk(`admin.settings.admission.${m}.desc`)}</span>
            </label>
          {/each}
        </div>
        <div class="row end">
          <Button type="submit" pending={pending === "admission"} disabled={admission === st.admissionMode}>
            {t("admin.settings.saveAdmission")}
          </Button>
        </div>
      </form>
    </section>

    <section id="engagement" aria-labelledby="engagement-title">
      <h2 id="engagement-title">{t("admin.settings.engagement")}</h2>
      <p class="lead">{t("admin.settings.engagement.lead")}</p>
      <form method="POST" action="?/engagement" use:enhance={submit("engagement")} class="stack">
        <input type="hidden" name="referral" value={referral || eng.referralForced ? "on" : ""} />
        <Switch
          label={t("admin.settings.referral")}
          description={eng.referralForced ? t("admin.settings.referral.forced") : t("admin.settings.referral.desc")}
          checked={referral || eng.referralForced}
          disabled={eng.referralForced}
          onchange={(v) => (referral = v)}
          onLabel={t("common.yes")}
          offLabel={t("common.no")}
        />
        <fieldset class="scale">
          <legend>{t("admin.settings.points")}</legend>
          {#if eng.points}
            <p class="hint">{t("admin.settings.points.lead")}</p>
            <div class="scale-grid">
              {#each ACTIONS as a (a)}
                <label class="scale-row">
                  <span>{tk(`admin.settings.points.${a}`)}</span>
                  <input type="number" name="scale_{a}" min="0" max="1000" value={eng.scale[a]} inputmode="numeric" />
                </label>
              {/each}
            </div>
          {:else}
            <p class="hint">{format(t("plan.lockedIn"), { tier: t("plan.mouvement") })}</p>
          {/if}
        </fieldset>
        <div class="row end">
          <Button type="submit" pending={pending === "engagement"}>{t("admin.settings.saveEngagement")}</Button>
        </div>
      </form>
    </section>

    <section id="statuses" aria-labelledby="statuses-title">
      <h2 id="statuses-title">{t("admin.settings.statuses")}</h2>
      <p class="lead">{t("admin.settings.statuses.lead")}</p>
      {#if st.statuses.length === 0}<p class="muted">{t("admin.settings.statuses.empty")}</p>{/if}
      <ol class="statuses">
        {#each st.statuses as s (s.id)}
          <li>
            {#if editing === s.id}
              <form method="POST" action="?/status" use:enhance={submit(`status-${s.id}`)} class="status-form">
                <input type="hidden" name="id" value={s.id} />
                <Field
                  label={t("admin.settings.status.label")}
                  name="labelFr"
                  required
                  maxlength={80}
                  value={s.label.fr}
                />
                <Field
                  label={t("admin.settings.status.labelHt")}
                  name="labelHt"
                  maxlength={80}
                  value={s.label.ht ?? ""}
                />
                <Field
                  label={t("admin.settings.status.rank")}
                  name="rank"
                  type="number"
                  min="0"
                  max="1000"
                  value={String(s.rank)}
                />
                <div class="row">
                  <Button type="submit" size="sm" pending={pending === `status-${s.id}`}
                    >{t("admin.settings.status.save")}</Button
                  >
                  <Button size="sm" variant="ghost" onclick={() => (editing = null)}>{t("common.cancel")}</Button>
                </div>
              </form>
            {:else}
              <span class="rank" aria-hidden="true">{s.rank}</span>
              <span class="status-name">
                <strong>{s.label.fr}</strong>
                {#if s.label.ht}<span class="muted">{s.label.ht}</span>{/if}
              </span>
              <Badge>{format(t("admin.settings.status.members"), { n: String(s.members) })}</Badge>
              <Button size="sm" variant="ghost" onclick={() => (editing = s.id)}
                >{t("admin.settings.status.edit")}</Button
              >
            {/if}
          </li>
        {/each}
      </ol>
      {#if editing === "new"}
        <form method="POST" action="?/status" use:enhance={submit("status-new")} class="status-form new">
          <Field label={t("admin.settings.status.label")} name="labelFr" required maxlength={80} />
          <Field label={t("admin.settings.status.labelHt")} name="labelHt" maxlength={80} />
          <Field
            label={t("admin.settings.status.rank")}
            name="rank"
            type="number"
            min="0"
            max="1000"
            value={String((st.statuses.at(-1)?.rank ?? 0) + 10)}
          />
          <div class="row">
            <Button type="submit" size="sm" pending={pending === "status-new"}>{t("admin.settings.status.add")}</Button>
            <Button size="sm" variant="ghost" onclick={() => (editing = null)}>{t("common.cancel")}</Button>
          </div>
        </form>
      {:else}
        <div>
          <Button variant="secondary" onclick={() => (editing = "new")}>{t("admin.settings.status.add")}</Button>
        </div>
      {/if}
    </section>
  </main>

  <aside class="preview" aria-label={t("admin.settings.preview")}>
    <MemberCard
      partyName={name || st.name}
      brandColor={color}
      secondaryColor={secondary}
      logoUrl={st.logoUrl}
      memberName={`${data.me.member.firstName} ${data.me.member.lastName}`}
      memberNumber={data.me.member.number}
      location={t("create.card.place")}
      labels={{ card: t("create.card.label"), number: t("create.card.number") }}
      shineKey={`${color}${secondary}`}
    />
  </aside>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr) 380px;
    gap: var(--s-8);
    padding: var(--s-6) var(--s-8) var(--s-14);
    align-items: start;
  }
  .toc,
  .preview {
    position: sticky;
    top: var(--s-6);
  }
  .toc-title {
    margin: 0 0 var(--s-3);
    font: 600 var(--fs-15) / 1.2 var(--font-display);
  }
  .toc ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .toc a {
    min-height: 40px;
    display: flex;
    align-items: center;
    padding: 0 var(--s-3);
    border-radius: var(--r-sm);
    color: var(--c-ink);
    text-decoration: none;
    font-size: var(--fs-14);
  }
  .toc a:hover {
    background: var(--c-surface);
  }
  .toc a:focus-visible,
  .file:has(input:focus-visible),
  .lang:has(input:focus-visible),
  .mode:has(input:focus-visible) {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-6);
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
  section {
    scroll-margin-top: var(--s-6);
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-6);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    background: var(--c-surface);
  }
  h2 {
    margin: 0;
    font: 600 var(--fs-22) / 1.2 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .lead,
  .muted,
  .quota {
    margin: 0;
    color: var(--c-ink-2);
    font-size: var(--fs-14);
    line-height: 1.5;
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
  .address {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--fs-14);
  }
  .address span,
  .label {
    margin: 0;
    font-size: var(--fs-14);
    font-weight: 600;
  }
  .address strong {
    font-weight: 500;
    color: var(--c-ink-2);
  }
  .logo-block {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    padding-top: var(--s-4);
    border-top: 1px solid var(--c-line-soft);
  }
  .logo-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-3);
  }
  .logo {
    width: 64px;
    height: 64px;
    border-radius: var(--r-pill);
    object-fit: cover;
    border: 1px solid var(--c-line);
  }
  .logo-form {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2);
  }
  .file {
    position: relative;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    cursor: pointer;
  }
  .file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .langs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--s-2);
  }
  .lang,
  .mode {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--s-3) var(--s-4);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    cursor: pointer;
  }
  .lang input,
  .mode input {
    position: absolute;
    opacity: 0;
  }
  .lang.on,
  .mode.on {
    border-color: var(--c-primary);
    box-shadow: inset 0 0 0 1px var(--c-primary);
    background: var(--c-primary-tint);
  }
  .lang.locked {
    cursor: default;
    border-style: dashed;
    background: var(--c-paper);
  }
  .lang-name,
  .mode-name {
    font-weight: 600;
  }
  .lock {
    font-size: var(--fs-12);
    color: var(--c-ink-2);
  }
  .scale {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  .scale legend {
    font: 600 var(--fs-15) / 1.3 var(--font-ui);
    margin-bottom: var(--s-1);
  }
  .hint {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .scale-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--s-2) var(--s-5);
  }
  .scale-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: 44px;
    font-size: var(--fs-14);
  }
  .scale-row input {
    width: 88px;
    min-height: 40px;
    padding: 0 var(--s-2);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    font: 600 var(--fs-15) / 1 var(--font-ui);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-2);
  }
  .mode-desc {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
    line-height: 1.4;
  }
  .statuses {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  .statuses li {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-3) 0;
    border-bottom: 1px solid var(--c-line-soft);
  }
  .rank {
    width: 36px;
    height: 36px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--c-accent-tint);
    color: var(--c-on-accent);
    font: 600 var(--fs-13) / 1.12 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .status-name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .status-form {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-3);
    align-items: end;
  }
  .status-form .row {
    grid-column: 1 / -1;
  }
  .status-form.new {
    padding: var(--s-4);
    border: 1px dashed var(--c-line);
    border-radius: var(--r-md);
  }
  @media (max-width: 1280px) {
    .layout {
      grid-template-columns: minmax(0, 1fr) 340px;
    }
    .toc {
      display: none;
    }
  }
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
      padding: var(--s-5) var(--s-4) var(--s-10);
    }
    .preview {
      position: static;
      order: -1;
      max-width: 380px;
    }
    .modes,
    .status-form {
      grid-template-columns: 1fr;
    }
    section {
      padding: var(--s-5) var(--s-4);
    }
  }
</style>
