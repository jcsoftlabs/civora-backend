# civora

Plateforme SaaS pour les partis politiques haïtiens. Nom commercial provisoire.

## Démarrer

```
pnpm install
cp .env.example .env        # renseigner les valeurs locales
docker compose up -d        # Postgres local (sans Docker : scripts/db-local.sh start)
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Documentation

- `CLAUDE.md` : règles du projet, lues automatiquement par Claude Code
- `docs/requirements.md` : toutes les exigences numérotées et leur statut
- `docs/roadmap.md` : phases, jalons et tâches dans l'ordre
- `docs/architecture.md` : isolation, paiements, votes, hors ligne, facturation
- `docs/design/tokens.css` et le skill `.claude/skills/ui-design` : identité visuelle

## Travailler avec Claude Code

- `/implementer ADH-07` : implémente une exigence de bout en bout
- `/nouvel-ecran Fiche membre ADH-02` : conçoit et code un écran
- `/revue-securite` : revue avant fusion

Responsable : Christopher Jerome.
