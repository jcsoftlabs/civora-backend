<!--
  Création d'un espace parti (SOC-01, SOC-03). Trois étapes : le parti, le fondateur, le code reçu par e-mail.
  À droite, la carte de membre du parti se compose en direct (nom, couleur, fondateur, section) : l'objet signature
  du produit, et le seul moment animé de l'écran (le reflet passe à chaque nouvelle couleur).
-->
<script lang="ts">
  import { Badge, Button, Field, MemberCard, partyTheme, themeStyle } from "@civora/ui";
  import { format, translator, type MessageKey } from "$lib/i18n";
  import { resolve } from "$app/paths";
  import { env } from "$env/dynamic/public";
  import type { PageData } from "./$types";

  let { data }: { data: PageData & { locale: "fr" | "ht" } } = $props();
  const t = $derived(translator(data.locale));
  const tk = (key: string) => t(key as MessageKey);

  // Couleurs fondamentales, toutes lisibles telles quelles (contraste 4,5:1 au moins avec leur texte).
  // Le parti peut aussi choisir n'importe quelle couleur, ou saisir le code exact de sa charte graphique.
  const COLORS = [
    { hex: "#C8102E", name: "rouge" },
    { hex: "#E8590C", name: "orange" },
    { hex: "#F2C200", name: "jaune" },
    { hex: "#1C8339", name: "vert" },
    { hex: "#0F6E66", name: "petrole" },
    { hex: "#1F8FD1", name: "bleuciel" },
    { hex: "#1F5FBF", name: "bleu" },
    { hex: "#6D28D9", name: "violet" },
    { hex: "#D6336C", name: "rose" },
    { hex: "#7A4A2A", name: "marron" },
    { hex: "#5F6368", name: "gris" },
    { hex: "#1C1B19", name: "noir" },
  ];
  const LANGS = ["fr", "ht", "en", "es"] as const;

  let step = $state<"party" | "founder" | "code" | "done">("party");
  let name = $state("");
  let slug = $state("");
  let slugTouched = $state(false);
  let slugState = $state<"idle" | "checking" | "available" | "taken" | "reserved" | "invalid">("idle");
  let color = $state("#0F6E66");
  // Suit la couleur choisie ; reste modifiable à la main (code de la charte du parti).
  let hexInput = $derived(color.toUpperCase());
  /** Seconde couleur (facultative) : null = aucune. */
  let secondary = $state<string | null>(null);
  let orientation = $state<"horizontal" | "vertical">("horizontal");

  function applyHex() {
    const v = hexInput.trim().replace(/^([0-9a-f]{6})$/i, "#$1");
    if (/^#[0-9a-f]{6}$/i.test(v)) color = v.toUpperCase();
  }
  let tier = $state<"essentiel" | "mouvement" | "national">("mouvement");
  let languages = $state<string[]>(["fr", "ht"]);
  let firstName = $state("");
  let lastName = $state("");
  let email = $state("");
  let zoneQuery = $state("");
  let zoneResults = $state<Array<{ code: string; name: string; context: string | null }>>([]);
  let zone = $state<{ code: string; name: string; context: string | null } | null>(null);
  let code = $state("");
  let pending = $state(false);
  let failure = $state<string | null>(null);
  let signup = $state<{ signupId: string; challengeId: string } | null>(null);
  let openUrl = $state("");

  const tierInfo = $derived(data.tiers.find((x) => x.id === tier)!);
  const maxLanguages = $derived(tierInfo.languages);
  const theme = $derived(partyTheme(color));
  const adjusted = $derived(theme["--c-primary"] !== color.toUpperCase());
  const location = $derived(zone ? [zone.name, zone.context].filter(Boolean).join(", ") : t("create.card.place"));

  /** Adresse proposée à partir du nom : sans accents, en minuscules, mots reliés par des tirets. */
  function slugify(v: string) {
    return v
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "");
  }
  $effect(() => {
    if (!slugTouched) slug = slugify(name);
  });
  $effect(() => {
    // Réduit les langues si la formule en permet moins.
    if (languages.length > maxLanguages) languages = languages.slice(0, maxLanguages);
  });

  let slugTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const s = slug;
    clearTimeout(slugTimer);
    if (!s) return void (slugState = "idle");
    slugState = "checking";
    slugTimer = setTimeout(async () => {
      const res = await fetch(`/creer/api/slug?slug=${encodeURIComponent(s)}`);
      const body = (await res.json()) as { available: boolean; reason?: "taken" | "reserved" | "invalid" };
      if (s === slug) slugState = body.available ? "available" : (body.reason ?? "invalid");
    }, 350);
  });

  let zoneTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const q = zoneQuery;
    clearTimeout(zoneTimer);
    if (zone && q === [zone.name, zone.context].filter(Boolean).join(", ")) return;
    if (q.trim().length < 2) return void (zoneResults = []);
    zoneTimer = setTimeout(async () => {
      const res = await fetch(`/creer/api/zones?q=${encodeURIComponent(q)}`);
      if (q === zoneQuery) zoneResults = ((await res.json()) as { zones: typeof zoneResults }).zones;
    }, 250);
  });

  function pickZone(z: { code: string; name: string; context: string | null }) {
    zone = z;
    zoneQuery = [z.name, z.context].filter(Boolean).join(", ");
    zoneResults = [];
  }

  function toggleLanguage(l: string) {
    if (languages.includes(l)) languages = languages.filter((x) => x !== l);
    else if (languages.length < maxLanguages) languages = [...languages, l];
  }

  const partyReady = $derived(name.trim().length >= 2 && slugState === "available" && languages.length > 0);
  const founderReady = $derived(
    firstName.trim() && lastName.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && zone,
  );

  async function post(path: string, body: unknown) {
    pending = true;
    failure = null;
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        failure = tk(`error.${json.code}`) === `error.${json.code}` ? t("error.generic") : tk(`error.${json.code}`);
        return null;
      }
      return json;
    } catch {
      failure = t("error.generic");
      return null;
    } finally {
      pending = false;
    }
  }

  async function sendCode() {
    const res = await post("/creer/api/start", {
      party: {
        name: name.trim(),
        slug,
        brandColor: theme["--c-primary"],
        brandColorSecondary: secondary,
        tier,
        languages,
      },
      founder: {
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        zoneCode: zone!.code,
        locale: data.locale,
      },
    });
    if (res) {
      signup = res;
      step = "code";
    }
  }

  async function confirm() {
    const res = await post("/creer/api/complete", { ...signup, code });
    if (res) {
      openUrl = res.openUrl;
      step = "done";
    }
  }

  const steps = ["party", "founder", "code"] as const;
  const rootDomain =
    env.PUBLIC_ROOT_DOMAIN && env.PUBLIC_ROOT_DOMAIN !== "localhost" ? env.PUBLIC_ROOT_DOMAIN : "civora.app";
</script>

<svelte:head><title>{t("create.title")} | civora</title></svelte:head>

<main style={themeStyle(theme)}>
  <header class="top">
    <a href={resolve("/")} class="brand display">civora</a>
    <form method="POST" action="/langue">
      <input type="hidden" name="lang" value={data.locale === "fr" ? "ht" : "fr"} />
      <button type="submit" class="lang-switch">{t("lang.switch")}</button>
    </form>
  </header>

  <div class="layout">
    <section class="form" aria-labelledby="title">
      {#if step !== "done"}
        <h1 id="title">{t("create.title")}</h1>
        <p class="lead">{t("create.lead")}</p>

        <ol class="steps">
          {#each steps as s (s)}
            <li class:current={step === s} aria-current={step === s ? "step" : undefined}>{tk(`create.step.${s}`)}</li>
          {/each}
        </ol>
      {/if}

      {#if step === "party"}
        <div class="stack">
          <Field label={t("create.name")} bind:value={name} maxlength={120} autocomplete="organization" />
          <div class="slug">
            <Field
              label={t("create.slug")}
              bind:value={slug}
              maxlength={40}
              hint={t("create.slug.hint")}
              oninput={() => (slugTouched = true)}
              autocapitalize="none"
              spellcheck={false}
            />
            <p class="slug-line" aria-live="polite">
              <span class="url">{slug || t("create.slug.example")}.{rootDomain}</span>
              {#if slugState === "available"}<Badge tone="success">{t("create.slug.available")}</Badge>{/if}
            </p>
            {#if slugState === "taken" || slugState === "reserved" || slugState === "invalid"}
              <p class="msg error">{tk(`create.slug.${slugState}`)}</p>
            {/if}
          </div>

          <fieldset>
            <legend>{t("create.color")}</legend>
            <div class="swatches">
              {#each COLORS as c (c.hex)}
                <label class="swatch" style:--sw={c.hex}>
                  <input type="radio" name="color" value={c.hex} bind:group={color} />
                  <span class="dot" aria-hidden="true"></span>
                  <span class="sr-only">{tk(`create.color.${c.name}`)}</span>
                </label>
              {/each}
              <label class="swatch custom">
                <input type="color" bind:value={color} aria-label={t("create.color.custom")} />
              </label>
            </div>
            <label class="hex">
              <span>{t("create.color.hex")}</span>
              <input
                bind:value={hexInput}
                onchange={applyHex}
                onkeydown={(e) => e.key === "Enter" && applyHex()}
                maxlength={7}
                spellcheck={false}
                autocapitalize="characters"
              />
            </label>
            {#if adjusted}<p class="msg">{t("create.color.adjusted")}</p>{/if}
          </fieldset>

          <fieldset>
            <legend>{t("create.color.secondary")}</legend>
            <div class="swatches">
              <label class="none">
                <input type="radio" name="secondary" value={null} bind:group={secondary} />
                <span>{t("create.color.none")}</span>
              </label>
              <label class="swatch white" style:--sw="#FFFFFF">
                <input type="radio" name="secondary" value="#FFFFFF" bind:group={secondary} />
                <span class="dot" aria-hidden="true"></span>
                <span class="sr-only">{t("create.color.blanc")}</span>
              </label>
              {#each COLORS as c (c.hex)}
                {#if c.hex !== color}
                  <label class="swatch" style:--sw={c.hex}>
                    <input type="radio" name="secondary" value={c.hex} bind:group={secondary} />
                    <span class="dot" aria-hidden="true"></span>
                    <span class="sr-only">{tk(`create.color.${c.name}`)}</span>
                  </label>
                {/if}
              {/each}
            </div>
            <p class="msg">{t("create.color.secondary.hint")}</p>
          </fieldset>

          <fieldset>
            <legend>{t("create.tier")}</legend>
            <div class="tiers">
              {#each data.tiers as x (x.id)}
                <label class="tier" class:chosen={tier === x.id}>
                  <input type="radio" name="tier" value={x.id} bind:group={tier} />
                  <span class="tier-name display">{tk(`plan.${x.id}`)}</span>
                  <span class="price"><span class="num">{x.monthlyUsd}</span> {t("create.tier.month")}</span>
                  <span class="tier-desc">{tk(`create.tier.${x.id}`)}</span>
                </label>
              {/each}
            </div>
          </fieldset>

          <fieldset>
            <legend>{t("create.languages")}</legend>
            <div class="langs">
              {#each LANGS as l (l)}
                <label class="lang" class:on={languages.includes(l)}>
                  <input
                    type="checkbox"
                    checked={languages.includes(l)}
                    disabled={!languages.includes(l) && languages.length >= maxLanguages}
                    onchange={() => toggleLanguage(l)}
                  />
                  {tk(`lang.${l}`)}
                </label>
              {/each}
            </div>
            <p class="msg">{format(t("create.languages.limit"), { n: String(maxLanguages) })}</p>
          </fieldset>

          <div class="actions">
            <Button disabled={!partyReady} onclick={() => (step = "founder")}>{t("create.next")}</Button>
          </div>
        </div>
      {:else if step === "founder"}
        <div class="stack">
          <div class="row2">
            <Field label={t("create.firstName")} bind:value={firstName} maxlength={80} autocomplete="given-name" />
            <Field label={t("create.lastName")} bind:value={lastName} maxlength={80} autocomplete="family-name" />
          </div>
          <Field
            label={t("create.email")}
            type="email"
            bind:value={email}
            hint={t("create.email.hint")}
            autocomplete="email"
          />
          <div class="combo">
            <Field
              label={t("create.zone")}
              bind:value={zoneQuery}
              hint={t("create.zone.hint")}
              role="combobox"
              aria-expanded={zoneResults.length > 0}
              aria-controls="zone-list"
              aria-autocomplete="list"
              oninput={() => (zone = null)}
            />
            {#if zoneResults.length}
              <ul id="zone-list" role="listbox" class="results">
                {#each zoneResults as z (z.code)}
                  <li role="option" aria-selected={zone?.code === z.code}>
                    <button type="button" onclick={() => pickZone(z)}>
                      <span>{z.name}</span>{#if z.context}<span class="ctx">{z.context}</span>{/if}
                    </button>
                  </li>
                {/each}
              </ul>
            {:else if zoneQuery.trim().length >= 2 && !zone}
              <p class="msg">{t("create.zone.empty")}</p>
            {/if}
          </div>
          <div class="actions">
            <Button variant="ghost" onclick={() => (step = "party")}>{t("create.back")}</Button>
            <Button disabled={!founderReady} {pending} onclick={sendCode}>{t("create.send")}</Button>
          </div>
        </div>
      {:else if step === "code"}
        <div class="stack">
          <Field
            label={t("create.code")}
            bind:value={code}
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength={6}
            hint={format(t("create.code.hint"), { email })}
          />
          <div class="actions">
            <Button variant="ghost" onclick={() => (step = "founder")}>{t("create.back")}</Button>
            <Button disabled={!/^\d{6}$/.test(code)} {pending} onclick={confirm}>{t("create.confirm")}</Button>
          </div>
        </div>
      {:else}
        <div class="done">
          <h1>{format(t("create.done.title"), { party: name })}</h1>
          <p class="lead">{t("create.done.lead")}</p>
          <Button href={openUrl}>{t("create.done.open")}</Button>
        </div>
      {/if}

      {#if failure}<p class="msg error" role="alert">{failure}</p>{/if}
    </section>

    <aside class="preview" aria-label={t("create.card.label")}>
      <div class="format" role="radiogroup" aria-label={t("create.card.format")}>
        <label class:on={orientation === "horizontal"}>
          <input type="radio" name="orientation" value="horizontal" bind:group={orientation} />{t(
            "create.card.horizontal",
          )}
        </label>
        <label class:on={orientation === "vertical"}>
          <input type="radio" name="orientation" value="vertical" bind:group={orientation} />{t("create.card.vertical")}
        </label>
      </div>
      <MemberCard
        partyName={name || t("create.name")}
        brandColor={color}
        secondaryColor={secondary}
        memberName={[firstName, lastName].filter(Boolean).join(" ") || t("create.card.you")}
        memberNumber="000001"
        {location}
        {orientation}
        verifyUrl={`https://${slug || t("create.slug.example")}.${rootDomain}`}
        labels={{
          card: t("create.card.label"),
          number: t("create.card.number"),
          member: t("create.card.member"),
          qr: t("create.card.qr"),
        }}
        shineKey={`${color}${secondary}${orientation}`}
      />
      <p class="msg">{t("create.card.qr.hint")}</p>
    </aside>
  </div>
</main>

<style>
  main {
    max-width: 1120px;
    margin: 0 auto;
    padding: var(--s-5) var(--s-4) var(--s-24);
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: var(--touch-min);
  }
  .brand {
    font-size: var(--fs-22);
    font-weight: 800;
    color: var(--c-ink);
    text-decoration: none;
  }
  .lang-switch {
    min-height: var(--touch-min);
    padding: 0 var(--s-4);
    border: 1.5px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    cursor: pointer;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 400px);
    gap: var(--s-14);
    margin-top: var(--s-10);
    align-items: start;
  }
  .preview {
    position: sticky;
    top: var(--s-10);
    padding-top: var(--s-6);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-6);
  }
  .preview .msg {
    max-width: 320px;
    text-align: center;
  }
  .format {
    display: inline-flex;
    padding: 3px;
    border-radius: var(--r-pill);
    background: var(--c-surface);
    border: 1px solid var(--c-line);
  }
  .format label {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    padding: 0 var(--s-4);
    border-radius: var(--r-pill);
    font: 600 var(--fs-13) / 1 var(--font-ui);
    color: var(--c-ink-2);
    cursor: pointer;
  }
  .format input {
    position: absolute;
    opacity: 0;
    inset: 0;
    cursor: pointer;
  }
  .format label.on {
    background: var(--c-ink);
    color: var(--c-surface);
  }
  .format label:has(input:focus-visible) {
    box-shadow: var(--focus-ring);
  }
  /* « Aucune » : un vrai bouton avec son libellé, pour ne pas être pris pour du blanc. */
  .none {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-min);
    padding: 0 var(--s-4);
    border: 1.5px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    font: 600 var(--fs-13) / 1 var(--font-ui);
    color: var(--c-ink-2);
    cursor: pointer;
  }
  .none input {
    position: absolute;
    opacity: 0;
    inset: 0;
    cursor: pointer;
  }
  .none:has(input:checked) {
    border-color: var(--c-ink);
    color: var(--c-ink);
  }
  .none:has(input:focus-visible) {
    box-shadow: var(--focus-ring);
  }
  .swatch.white .dot {
    box-shadow: inset 0 0 0 1.5px var(--c-line);
  }
  h1 {
    margin: 0;
    font-size: clamp(var(--fs-32), 5vw, var(--fs-52));
    font-weight: 800;
    letter-spacing: -0.035em;
  }
  .lead {
    margin: var(--s-3) 0 0;
    max-width: 34em;
    color: var(--c-ink-2);
    font-size: var(--fs-16);
  }
  .steps {
    display: flex;
    gap: var(--s-2);
    margin: var(--s-8) 0 var(--s-6);
    padding: 0;
    list-style: none;
    counter-reset: step;
    flex-wrap: wrap;
  }
  .steps li {
    counter-increment: step;
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    padding: 6px var(--s-3) 6px 6px;
    border-radius: var(--r-pill);
    background: var(--c-surface);
    border: 1px solid var(--c-line);
    font: 600 var(--fs-13) / 1 var(--font-ui);
    color: var(--c-ink-2);
  }
  .steps li::before {
    content: counter(step);
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: var(--r-pill);
    background: var(--c-line-soft);
    font-variant-numeric: tabular-nums;
  }
  .steps li.current {
    color: var(--c-ink);
    border-color: var(--c-ink);
  }
  .steps li.current::before {
    background: var(--c-primary);
    color: var(--c-on-primary);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--s-6);
    max-width: 560px;
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s-4);
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
    margin-bottom: var(--s-3);
    font: 600 var(--fs-14) / 1.3 var(--font-ui);
  }
  .slug-line {
    margin: var(--s-2) 0 0;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    flex-wrap: wrap;
  }
  .url {
    font: 600 var(--fs-14) / 1.3 var(--font-ui);
    color: var(--c-ink);
    word-break: break-all;
  }
  .swatches {
    display: flex;
    gap: var(--s-2);
    flex-wrap: wrap;
  }
  .swatch {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--touch-min);
    height: var(--touch-min);
    cursor: pointer;
  }
  .swatch input[type="radio"] {
    position: absolute;
    opacity: 0;
    inset: 0;
    cursor: pointer;
  }
  .dot {
    width: 32px;
    height: 32px;
    border-radius: var(--r-pill);
    background: var(--sw);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
  }
  .swatch input:checked + .dot {
    box-shadow:
      0 0 0 2px var(--c-surface),
      0 0 0 4px var(--c-ink);
  }
  .swatch input:focus-visible + .dot {
    box-shadow: var(--focus-ring);
  }
  .hex {
    display: inline-flex;
    align-items: center;
    gap: var(--s-3);
    font: 500 var(--fs-13) / 1 var(--font-ui);
    color: var(--c-ink-2);
  }
  .hex input {
    width: 7.5em;
    min-height: 36px;
    padding: 0 var(--s-3);
    border: 1.5px solid var(--c-line);
    border-radius: var(--r-sm);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  .hex input:focus-visible {
    outline: none;
    border-color: var(--c-primary);
    box-shadow: var(--focus-ring);
  }
  .custom input {
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1.5px dashed var(--c-ink-3);
    border-radius: var(--r-pill);
    background: none;
    cursor: pointer;
  }
  .tiers {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-2);
  }
  .tier {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    padding: var(--s-4);
    border: 1.5px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    cursor: pointer;
  }
  .tier input {
    position: absolute;
    opacity: 0;
    inset: 0;
    cursor: pointer;
  }
  .tier:has(input:focus-visible) {
    box-shadow: var(--focus-ring);
  }
  .tier.chosen {
    border-color: var(--c-ink);
    background: var(--c-ink);
    color: var(--c-surface);
  }
  .tier-name {
    font-size: var(--fs-19);
    font-weight: 700;
  }
  .price {
    font-size: var(--fs-13);
  }
  .price .num {
    font: 800 var(--fs-22) / 1 var(--font-display);
  }
  .tier-desc {
    font-size: var(--fs-12);
    line-height: 1.4;
    opacity: 0.8;
  }
  .langs {
    display: flex;
    gap: var(--s-2);
    flex-wrap: wrap;
  }
  .lang {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    min-height: var(--touch-min);
    padding: 0 var(--s-4);
    border: 1.5px solid var(--c-line);
    border-radius: var(--r-pill);
    background: var(--c-surface);
    cursor: pointer;
    font: 600 var(--fs-14) / 1 var(--font-ui);
  }
  .lang.on {
    border-color: var(--c-primary);
    background: var(--c-primary-tint);
  }
  .lang input {
    accent-color: var(--c-primary);
    width: 16px;
    height: 16px;
  }
  .lang:has(input:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .combo {
    position: relative;
  }
  .results {
    position: absolute;
    z-index: 5;
    left: 0;
    right: 0;
    margin: var(--s-1) 0 0;
    padding: var(--s-1);
    list-style: none;
    background: var(--c-surface);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    box-shadow: var(--shadow-object);
    max-height: 280px;
    overflow-y: auto;
  }
  .results button {
    width: 100%;
    min-height: var(--touch-min);
    display: flex;
    justify-content: space-between;
    gap: var(--s-3);
    align-items: center;
    padding: 0 var(--s-3);
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    text-align: left;
    cursor: pointer;
    font: 500 var(--fs-14) / 1.3 var(--font-ui);
    color: var(--c-ink);
  }
  .results button:hover,
  .results button:focus-visible {
    background: var(--c-line-soft);
    outline: none;
  }
  .ctx {
    color: var(--c-ink-2);
    font-size: var(--fs-13);
  }
  .actions {
    display: flex;
    gap: var(--s-2);
    justify-content: flex-end;
  }
  .msg {
    margin: 0;
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .msg.error {
    color: var(--c-danger-text);
    margin-top: var(--s-3);
  }
  .done {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    align-items: flex-start;
    max-width: 560px;
    padding-top: var(--s-10);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  @media (max-width: 880px) {
    .layout {
      grid-template-columns: 1fr;
      gap: var(--s-6);
      margin-top: var(--s-4);
    }
    .preview {
      position: static;
      order: -1;
      padding-top: 0;
    }
    .tiers {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 480px) {
    .row2 {
      grid-template-columns: 1fr;
    }
  }
</style>
