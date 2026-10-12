// ADH-07 : champs qu'un fichier de membres peut alimenter, et reconnaissance des en-têtes de colonnes usuels
// (français, créole, anglais). La correspondance proposée reste modifiable dans l'assistant.

export const IMPORT_FIELDS = [
  "firstName",
  "lastName",
  "fullName",
  "phone",
  "email",
  "birthDate",
  "nin",
  "nif",
  "commune",
  "section",
  "city",
  "country",
  "status",
  "joinedAt",
  "tags",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Champ → index de colonne dans le fichier (0 = première colonne). */
export type ColumnMapping = Partial<Record<ImportField, number>>;

/** Minuscules, sans accents ni ponctuation, espaces simples : « Date de naissance » → « date de naissance ». */
export function plain(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ALIASES: Record<ImportField, string[]> = {
  firstName: ["prenom", "prenoms", "first name", "firstname", "given name", "non"],
  lastName: ["nom", "nom de famille", "last name", "lastname", "surname", "family name", "siyati"],
  fullName: [
    "nom complet",
    "nom et prenom",
    "nom et prenoms",
    "nom prenom",
    "prenom et nom",
    "full name",
    "name",
    "non konple",
  ],
  phone: [
    "telephone",
    "tel",
    "phone",
    "mobile",
    "cellulaire",
    "cell",
    "whatsapp",
    "numero de telephone",
    "no telephone",
    "telefon",
  ],
  email: ["email", "e mail", "courriel", "mail", "adresse email", "adresse e mail", "imel"],
  birthDate: [
    "date de naissance",
    "naissance",
    "ne le",
    "nee le",
    "birth date",
    "birthdate",
    "date of birth",
    "dob",
    "dat nesans",
  ],
  nin: [
    "nin",
    "cin",
    "numero d identification",
    "numero d identification nationale",
    "carte d identification",
    "cin nin",
  ],
  nif: ["nif", "numero d identification fiscale"],
  commune: ["commune", "kominn", "ville", "localite"],
  section: ["section", "section communale", "seksyon", "seksyon kominal"],
  city: ["ville diaspora", "city", "ville de residence", "vil"],
  country: ["pays", "country", "pays de residence", "peyi"],
  status: ["statut", "status", "estati", "qualite"],
  joinedAt: [
    "date d adhesion",
    "adhesion",
    "membre depuis",
    "date d inscription",
    "inscription",
    "inscrit le",
    "date antre",
  ],
  tags: ["etiquettes", "etiquette", "tags", "tag", "groupe", "groupes", "categorie"],
};

/** Correspondance proposée : chaque en-tête reconnu va à son champ, une colonne ne sert qu'une fois. */
export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  const normalized = headers.map(plain);
  for (const field of IMPORT_FIELDS) {
    const i = normalized.findIndex((h, idx) => !used.has(idx) && h && ALIASES[field].includes(h));
    if (i >= 0) {
      mapping[field] = i;
      used.add(i);
    }
  }
  // Un nom complet n'a de sens que sans prénom et nom séparés.
  if (mapping.fullName !== undefined && mapping.firstName !== undefined && mapping.lastName !== undefined)
    delete mapping.fullName;
  return mapping;
}
