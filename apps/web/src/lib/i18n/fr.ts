// Français, langue de référence : toute clé existe ici d'abord.
export const fr = {
  "app.name": "civora",
  "app.tagline": "La plateforme des partis politiques haïtiens",
  "home.title": "Bienvenue sur civora",
  "home.lead": "L'espace de votre parti se prépare. Adhésions, cotisations, organes et rassemblements arrivent ici.",
  "home.status": "Fondations en place",
  "common.yes": "Oui",
  "common.no": "Non",
  "common.close": "Fermer",
  "common.cancel": "Annuler",
  "common.save": "Enregistrer",
  "common.loading": "Chargement",
  "common.simpleMode": "Mode simple",
  "plan.essentiel": "Essentiel",
  "plan.mouvement": "Mouvement",
  "plan.national": "National",
  "plan.lockedIn": "Disponible avec la formule {tier}",
  "plan.lockedOption": "Option à ajouter à votre formule",
  "plan.seePlans": "Voir les formules",
  "lang.switch": "Kreyòl",
  "error.notFound.title": "Cette page est introuvable",
  "error.notFound.lead": "Le lien est peut-être ancien. Revenez à l'accueil pour continuer.",
  "error.title": "Cette page ne répond pas",
  "error.lead": "Le service est momentanément indisponible. Réessayez dans quelques minutes.",
  "error.back": "Revenir à l'accueil",
} as const;

export type MessageKey = keyof typeof fr;
