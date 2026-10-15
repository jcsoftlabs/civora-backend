<!-- Accueil : le site commercial sur civora.space (SOC-12), sinon la page publique du parti. -->
<script lang="ts">
  import Marketing from "$lib/marketing/Marketing.svelte";
  import PartyHome from "$lib/marketing/PartyHome.svelte";
  import type { ActionData, PageData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

{#if data.surface === "marketing"}
  <Marketing locale={data.locale} {form} />
{:else}
  <PartyHome {data} />
{/if}
