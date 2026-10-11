<!--
  Vitrine de packages/ui (outil interne, développement uniquement : textes non traduits volontairement).
  Contrôle visuel de la checklist ui-design : 4 couleurs de parti, squelettes, états, largeur téléphone.
-->
<script lang="ts">
  import {
    Badge,
    Button,
    DataTable,
    Field,
    Locked,
    MemberCard,
    SidePanel,
    Skeleton,
    Switch,
    partyTheme,
    themeStyle,
  } from "@civora/ui";

  const PARTIES = [
    { name: "Pétrole", hex: "#0F6E66" },
    { name: "Prune", hex: "#7A2E5C" },
    { name: "Brique", hex: "#B5452B" },
    { name: "Bleu moyen", hex: "#2F5D9E" },
  ];

  type Row = { id: string; name: string; section: string; dues: "ok" | "late"; points: number };
  const rows: Row[] = [
    { id: "1", name: "Membre fictif A", section: "1re Montagne Noire", dues: "ok", points: 1240 },
    { id: "2", name: "Membre fictif B", section: "Turgeau", dues: "late", points: 310 },
    { id: "3", name: "Membre fictif C", section: "Diaspora, Montréal", dues: "ok", points: 865 },
  ];
  const columns = [
    { key: "name", label: "Membre" },
    { key: "section", label: "Section" },
    { key: "dues", label: "Cotisation" },
    { key: "points", label: "Points", align: "end" as const, numeric: true },
  ];

  let selected: string[] = $state([]);
  let loading = $state(false);
  let panelOpen = $state(false);
  let simpleMode = $state(false);
  let secret = $state(false);
  let organName = $state("Section Pétion-Ville");
</script>

<main>
  <h1>Composants</h1>

  <h2>Carte de membre, 4 couleurs de parti</h2>
  <div class="cards">
    {#each PARTIES as p, i (p.hex)}
      <MemberCard
        partyName={["Parti Horizon", "Mouvement Citadelle", "Rassemblement Lakou", "Union des Mornes"][i] ?? p.name}
        brandColor={p.hex}
        memberName={["Marie Joseph", "Jean-Baptiste Pierre", "Rose-Andrée Saint-Fleur", "Luc Dorvil"][i] ?? ""}
        memberNumber={["000001", "004217", "012988", "000356"][i] ?? ""}
        location={["1re Section Turgeau, Port-au-Prince", "Cap-Haïtien", "Miami, États-Unis", "Jacmel"][i] ?? ""}
        secondaryColor={[null, "#F2C200", "#1F5FBF", "#C8102E"][i] ?? null}
        verifyUrl="https://horizon.civora.app/v/AQEexemple"
        orientation={i % 2 === 1 ? "vertical" : "horizontal"}
        labels={{ card: "Carte de membre", number: "Membre n°", member: "Membre", qr: "QR de vérification" }}
      />
    {/each}
  </div>

  <h2>Boutons et pastilles, 4 couleurs de parti</h2>
  <div class="grid">
    {#each PARTIES as p (p.hex)}
      <div class="swatch" style={themeStyle(partyTheme(p.hex))}>
        <strong>{p.name}</strong>
        <div class="row">
          <Button>Créer un organe</Button>
          <Button variant="secondary">Exporter</Button>
        </div>
        <div class="row">
          <Button variant="ink" size="sm">Relancer</Button>
          <Button variant="ghost" size="sm">Annuler</Button>
          <Button size="sm" pending>Enregistrer</Button>
        </div>
        <div class="row">
          <Badge tone="primary">Section</Badge>
          <Badge tone="success">À jour</Badge>
          <Badge tone="warning">Échéance proche</Badge>
          <Badge tone="danger">En retard</Badge>
          <Badge tone="accent">2026 cotisation réglée</Badge>
        </div>
      </div>
    {/each}
  </div>

  <h2>Champs et interrupteurs</h2>
  <div class="card stack">
    <Field label="Nom de l'organe" bind:value={organName} maxlength={60} hint="Visible par les membres de l'organe." />
    <Field label="Téléphone" value="3700" error="Numéro incomplet. Saisissez les 8 chiffres après +509." />
    <Switch
      label="Organe secret"
      description="La liste des membres n'est visible que par les responsables de l'organe."
      onLabel="Oui"
      offLabel="Non"
      bind:checked={secret}
    />
  </div>

  <h2>Tableau</h2>
  <div class="row">
    <Button variant="secondary" size="sm" onclick={() => (loading = !loading)}>
      {loading ? "Afficher les lignes" : "Afficher le chargement"}
    </Button>
    <span>{selected.length} sélectionné(s)</span>
  </div>
  <DataTable
    caption="Membres"
    {columns}
    {rows}
    {loading}
    loadingLabel="Chargement des membres"
    selectable
    bind:selected
    selectAllLabel="Tout sélectionner"
    selectRowLabel={(r) => `Sélectionner ${r.name}`}
  >
    {#snippet cell(row, col)}
      {#if col.key === "dues"}
        <Badge tone={row.dues === "ok" ? "success" : "danger"}>{row.dues === "ok" ? "À jour" : "En retard"}</Badge>
      {:else if col.key === "points"}
        <span class="points display">{row.points}</span>
      {:else}
        {row[col.key as "name" | "section"]}
      {/if}
    {/snippet}
  </DataTable>

  <h2>Tableau vide</h2>
  <DataTable caption="Membres" {columns} rows={[]} loadingLabel="Chargement">
    {#snippet cell()}{/snippet}
    {#snippet empty()}
      <p>Aucun membre pour l'instant. Importez votre fichier pour commencer.</p>
      <Button>Importer un fichier</Button>
    {/snippet}
  </DataTable>

  <h2>Squelettes</h2>
  <div class="card stack">
    <Skeleton variant="avatar" label="Chargement" />
    <Skeleton lines={3} label="Chargement" />
    <Skeleton variant="card" label="Chargement" />
  </div>

  <h2>Option hors palier</h2>
  <div class="stack">
    <Locked
      title="Classements et badges"
      message="Disponible avec la formule Mouvement"
      actionLabel="Voir les formules"
      actionHref="/admin/abonnement"
    >
      <Badge tone="accent">1 240 points</Badge>
    </Locked>
  </div>

  <h2>Panneau latéral</h2>
  <Button onclick={() => (panelOpen = true)}>Modifier l'organe</Button>
  <SidePanel
    bind:open={panelOpen}
    bind:simpleMode
    title="Section Pétion-Ville"
    closeLabel="Fermer"
    simpleModeLabel="Mode simple"
  >
    <Field label="Nom de l'organe" bind:value={organName} maxlength={60} />
    {#snippet advanced()}
      <Switch
        label="Organe secret"
        description="Masque l'organe aux autres membres."
        onLabel="Oui"
        offLabel="Non"
        bind:checked={secret}
      />
      {#if secret}
        <Field label="Canal privé" placeholder="Lien WhatsApp ou Telegram" />
      {/if}
    {/snippet}
    {#snippet footer()}
      <Button variant="secondary" onclick={() => (panelOpen = false)}>Annuler</Button>
      <Button onclick={() => (panelOpen = false)}>Enregistrer</Button>
    {/snippet}
  </SidePanel>
</main>

<style>
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--s-8) var(--s-4) var(--s-24);
  }
  h1 {
    font-size: var(--fs-52);
    font-weight: 800;
    margin: 0 0 var(--s-6);
  }
  h2 {
    font-size: var(--fs-22);
    font-weight: 700;
    margin: var(--s-10) 0 var(--s-4);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--s-4);
  }
  .swatch,
  .card {
    background: var(--c-surface);
    border: 1px solid var(--c-line);
    border-radius: var(--r-lg);
    padding: var(--s-5);
  }
  .swatch {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
    max-width: 520px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2);
    margin-bottom: var(--s-3);
  }
  .points {
    font-weight: 700;
    font-size: var(--fs-16);
  }
</style>
