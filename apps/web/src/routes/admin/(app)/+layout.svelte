<!--
  Coque du back-office (skill ui-design, section 4) : rail d'icônes sombre à gauche (modules), avatar de la
  personne connectée avec son anneau, puis le contenu de la section. Sur téléphone, le rail passe en bas.
-->
<script lang="ts">
  import { organizationKind } from "$lib/i18n/org";
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { translator } from "$lib/i18n";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData & { locale: "fr" | "ht" }; children: Snippet } = $props();
  const orgKind = organizationKind();
  const t = $derived(translator(data.locale, orgKind()));
  const initials = $derived(`${data.me.member.firstName[0] ?? ""}${data.me.member.lastName[0] ?? ""}`.toUpperCase());
  const hasAccess = $derived(data.me.permissions.length > 0);
  const modules = $derived([
    {
      href: resolve("/admin"),
      label: t("admin.nav.dashboard"),
      icon: "dashboard",
      visible: data.me.permissions.includes("bi.read"),
    },
    {
      href: resolve("/admin/membres"),
      label: t("admin.nav.members"),
      icon: "members",
      visible: data.me.permissions.includes("members.read"),
    },
    {
      href: resolve("/admin/cotisations"),
      label: t("admin.nav.dues"),
      icon: "dues",
      visible: ["payments.read", "dues.manage", "payments.recordCash"].some((p) => data.me.permissions.includes(p)),
    },
    {
      href: resolve("/admin/evenements"),
      label: t("admin.nav.events"),
      icon: "events",
      visible: data.me.permissions.includes("events.manage"),
    },
    {
      href: resolve("/admin/formation"),
      label: t("admin.nav.training"),
      icon: "training",
      visible: data.me.permissions.includes("training.manage"),
    },
    {
      href: resolve("/admin/votes"),
      label: t("admin.nav.votes"),
      icon: "votes",
      visible: data.me.permissions.includes("votes.manage"),
    },
    {
      href: resolve("/admin/communication"),
      label: t("admin.nav.communication"),
      icon: "communication",
      visible: ["publications.manage", "outreach.send"].some((p) => data.me.permissions.includes(p)),
    },
    {
      href: resolve("/admin/organes"),
      label: t("admin.nav.organs"),
      icon: "organs",
      visible: data.me.permissions.includes("organs.manage"),
    },
    {
      href: resolve("/admin/journal"),
      label: t("admin.nav.audit"),
      icon: "audit",
      visible: data.me.permissions.includes("audit.read"),
    },
    {
      href: resolve("/admin/reglages"),
      label: t("admin.nav.settings"),
      icon: "settings",
      visible: data.me.permissions.includes("settings.party"),
    },
  ]);
</script>

<div class="shell">
  <nav class="rail" aria-label={t("admin.nav")}>
    <span class="seal" aria-hidden="true">{data.party.name.slice(0, 1).toUpperCase()}</span>
    <ul>
      {#each modules.filter((m) => m.visible) as m (m.href)}
        <li>
          <!-- eslint-disable svelte/no-navigation-without-resolve -->
          <a
            href={m.href}
            aria-current={(m.icon === "dashboard" ? page.url.pathname === m.href : page.url.pathname.startsWith(m.href))
              ? "page"
              : undefined}
            aria-label={m.label}
            title={m.label}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {#if m.icon === "training"}
                <!-- Formation : livre ouvert. -->
                <path d="M12 6.5c-2-1.6-4.8-2-8-1.6v12.6c3.2-.4 6 0 8 1.6 2-1.6 4.8-2 8-1.6V4.9c-3.2-.4-6 0-8 1.6z" />
                <path d="M12 6.5v12.6" />
              {:else if m.icon === "votes"}
                <!-- Votes : urne et bulletin glissé dans la fente. -->
                <path d="M4 11.5h16v8.5H4z" />
                <path d="M8.5 11.5V4h7v7.5" />
                <path d="M10.5 7.5l1.3 1.3 2.2-2.6M7 14.5h10" />
              {:else if m.icon === "audit"}
                <!-- Journal : registre scellé. -->
                <path d="M6 3.5h9l3 3v14H6z" />
                <path d="M9 9h6M9 12.5h6M9 16h3.5" />
              {:else if m.icon === "dashboard"}
                <!-- Tableau de bord : colonnes croissantes. -->
                <path d="M4 20h16" />
                <rect x="5.5" y="12" width="3" height="5.5" rx="1" />
                <rect x="10.5" y="8" width="3" height="9.5" rx="1" />
                <rect x="15.5" y="4.5" width="3" height="13" rx="1" />
              {:else if m.icon === "events"}
                <!-- Agenda : billet de rassemblement. -->
                <path d="M3.5 7.5h17v3a1.8 1.8 0 0 0 0 3.6v3.4h-17v-3.4a1.8 1.8 0 0 0 0-3.6z" />
                <path d="M9 8v1.5M9 11.5v1M9 14.5V16" />
              {:else if m.icon === "communication"}
                <!-- Communication : mégaphone. -->
                <path d="M4 10v4h3l6 4V6L7 10z" />
                <path d="M16.5 9.5a3.5 3.5 0 0 1 0 5M7 14l1.5 5h2.5l-1.3-4.3" />
              {:else if m.icon === "dues"}
                <!-- Cotisations : deux pièces empilées. -->
                <ellipse cx="10" cy="7" rx="6" ry="2.6" />
                <path d="M4 7v4c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6V7" />
                <path d="M8 15.6c.6 1.2 3 2.1 6 2.1 3.3 0 6-1.2 6-2.6v-4c0-1.1-1.6-2-4-2.4" />
              {:else if m.icon === "settings"}
                <!-- Réglages : trois curseurs. -->
                <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
                <circle cx="15" cy="7" r="2" />
                <circle cx="9" cy="12" r="2" />
                <circle cx="17" cy="17" r="2" />
              {:else if m.icon === "organs"}
                <!-- Organigramme : un bureau, trois sections. -->
                <rect x="9" y="3.5" width="6" height="4.5" rx="1.2" />
                <rect x="3" y="15.5" width="5" height="4.5" rx="1.2" />
                <rect x="9.5" y="15.5" width="5" height="4.5" rx="1.2" />
                <rect x="16" y="15.5" width="5" height="4.5" rx="1.2" />
                <path d="M12 8v4M5.5 15.5V12h13v3.5M12 12v3.5" />
              {:else}
                <circle cx="9" cy="8" r="3.2" />
                <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
                <circle cx="17" cy="9" r="2.4" />
                <path d="M15.6 14.2c2.4-.3 4.3 1.3 4.9 4.3" />
              {/if}
            </svg>
          </a>
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        </li>
      {/each}
    </ul>
    <details class="me">
      <summary class="avatar" aria-label="{data.me.member.firstName} {data.me.member.lastName}">{initials}</summary>
      <div class="menu">
        <p class="who">{data.me.member.firstName} {data.me.member.lastName}</p>
        <p class="party">{data.party.name}</p>
        <form method="POST" action="/admin/deconnexion">
          <button type="submit">{t("admin.logout")}</button>
        </form>
      </div>
    </details>
  </nav>

  <div class="content">
    {#if hasAccess}
      {@render children()}
    {:else}
      <section class="no-access">
        <h1>{t("admin.noAccess.title")}</h1>
        <p>{t("admin.noAccess.lead")}</p>
      </section>
    {/if}
  </div>
</div>

<style>
  .shell {
    min-height: 100dvh;
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
  }
  .rail {
    position: sticky;
    top: 0;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-6);
    padding: var(--s-4) 0;
    background: var(--c-rail);
    color: var(--c-surface);
  }
  .seal {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: var(--r-md);
    background: var(--c-primary);
    color: var(--c-on-primary);
    font: 600 var(--fs-19) / 1.12 var(--font-display);
  }
  ul {
    flex: 1;
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }
  a {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: var(--r-md);
    color: color-mix(in srgb, var(--c-surface) 62%, transparent);
  }
  a:hover {
    color: var(--c-surface);
    background: color-mix(in srgb, var(--c-surface) 8%, transparent);
  }
  /*
   * Module ouvert : un onglet de classeur. La tuile prend le papier de la page et s'y raccorde par deux arrondis
   * inversés ; l'icône passe à la couleur du parti. On voit d'où sort la page affichée.
   */
  ul {
    align-self: stretch;
  }
  li {
    display: flex;
    justify-content: center;
  }
  li:has(a[aria-current="page"]) {
    justify-content: flex-end;
  }
  a[aria-current="page"] {
    position: relative;
    width: 60px;
    border-radius: 14px 0 0 14px;
    background: var(--c-paper);
    color: var(--c-primary);
  }
  a[aria-current="page"]:hover {
    background: var(--c-paper);
    color: var(--c-primary);
  }
  a[aria-current="page"]::before,
  a[aria-current="page"]::after {
    content: "";
    position: absolute;
    right: 0;
    width: 14px;
    height: 14px;
    pointer-events: none;
  }
  a[aria-current="page"]::before {
    top: -14px;
    background: radial-gradient(circle at 0 0, transparent 14px, var(--c-paper) 14.5px);
  }
  a[aria-current="page"]::after {
    bottom: -14px;
    background: radial-gradient(circle at 0 100%, transparent 14px, var(--c-paper) 14.5px);
  }
  a[aria-current="page"] svg {
    stroke-width: 2;
  }
  a:focus-visible,
  .avatar:focus-visible {
    outline: 2px solid var(--c-accent-bright);
    outline-offset: 2px;
  }
  svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
  }
  .me {
    position: relative;
  }
  /* Avatar de la personne connectée : anneau ambre de présence ; il ouvre son menu. */
  .avatar {
    list-style: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: var(--r-pill);
    border: 0;
    cursor: pointer;
    background: color-mix(in srgb, var(--c-primary) 35%, var(--c-rail));
    color: var(--c-surface);
    font: 600 var(--fs-14) / 1.12 var(--font-display);
    box-shadow:
      0 0 0 2px var(--c-rail),
      0 0 0 4px var(--c-accent-bright);
  }
  .avatar::-webkit-details-marker {
    display: none;
  }
  .menu {
    position: absolute;
    left: calc(100% + 12px);
    bottom: 0;
    z-index: 20;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    padding: var(--s-4);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    border: 1px solid var(--c-line);
    box-shadow: var(--shadow-object);
  }
  .menu p {
    margin: 0;
  }
  .who {
    font: 600 var(--fs-15) / 1.3 var(--font-display);
  }
  .party {
    font-size: var(--fs-13);
    color: var(--c-ink-2);
  }
  .menu button {
    margin-top: var(--s-3);
    min-height: 44px;
    padding: 0 var(--s-3);
    border: 1px solid var(--c-line);
    border-radius: var(--r-md);
    background: var(--c-surface);
    color: var(--c-ink);
    font: 600 var(--fs-14) / 1 var(--font-ui);
    cursor: pointer;
  }
  .menu button:hover {
    background: var(--c-paper);
  }
  .content {
    min-width: 0;
  }
  .no-access {
    max-width: 560px;
    padding: var(--s-14) var(--s-6);
  }
  .no-access h1 {
    margin: 0 0 var(--s-3);
    font: 600 var(--fs-32) / 1.12 var(--font-display);
    letter-spacing: var(--tracking-display);
  }
  .no-access p {
    margin: 0;
    color: var(--c-ink-2);
    line-height: 1.5;
  }
  @media (max-width: 760px) {
    .shell {
      grid-template-columns: minmax(0, 1fr);
      padding-bottom: 72px;
    }
    /* Téléphone : barre en bas ; le sceau disparaît, les modules défilent, l'avatar reste visible à droite. */
    .rail {
      position: fixed;
      inset: auto 0 0 0;
      z-index: 10;
      height: 64px;
      flex-direction: row;
      gap: var(--s-2);
      padding: 0 var(--s-3);
    }
    .seal {
      display: none;
    }
    ul {
      min-width: 0;
      flex-direction: row;
      justify-content: flex-start;
      gap: 0;
      overflow-x: auto;
      scrollbar-width: none;
    }
    a {
      width: 46px;
      flex: none;
    }
    .me {
      flex: none;
    }
    /* Téléphone : l'onglet descend du bord supérieur de la barre, raccordé à la page au-dessus. */
    ul {
      align-self: stretch;
      align-items: flex-start;
    }
    li,
    li:has(a[aria-current="page"]) {
      justify-content: center;
    }
    a[aria-current="page"] {
      width: 50px;
      height: 52px;
      border-radius: 0 0 14px 14px;
    }
    a[aria-current="page"]::before,
    a[aria-current="page"]::after {
      top: 0;
      bottom: auto;
    }
    a[aria-current="page"]::before {
      right: auto;
      left: -14px;
      background: radial-gradient(circle at 0 100%, transparent 14px, var(--c-paper) 14.5px);
    }
    a[aria-current="page"]::after {
      right: -14px;
      background: radial-gradient(circle at 100% 100%, transparent 14px, var(--c-paper) 14.5px);
    }
    .menu {
      left: auto;
      right: 0;
      bottom: calc(100% + 12px);
    }
  }
</style>
