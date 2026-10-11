<script lang="ts">
  import type { Snippet } from "svelte";
  import { partyTheme, themeStyle } from "@civora/ui";
  import { setOrganizationKind } from "$lib/i18n/org";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: Snippet } = $props();
  // Vocabulaire des écrans selon le type d'organisation (SOC-11).
  setOrganizationKind(() => data.party.kind ?? "party");
  /** Couleur du parti à la place du vert pétrole, texte lisible calculé (marque blanche). */
  const style = $derived(themeStyle(partyTheme(data.party.brandColor)));
</script>

<svelte:head>
  <title>{data.party.name} | civora</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="themed" {style}>{@render children()}</div>

<style>
  .themed {
    min-height: 100dvh;
    background: var(--c-paper);
  }
</style>
