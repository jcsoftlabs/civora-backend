import type { ProviderCredentials } from "./types.js";

/**
 * Identifiants marchands du parti, stockés par référence (merchant_accounts.credentials_ref), jamais en base.
 * Référence « env:NOM » : variable d'environnement contenant un objet JSON (développement, petite production).
 * Un gestionnaire de secrets (Railway, Doppler, AWS) se branche ici sans changer le reste.
 */
export interface CredentialStore {
  get(ref: string): Promise<ProviderCredentials>;
}

export class EnvCredentialStore implements CredentialStore {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}
  async get(ref: string): Promise<ProviderCredentials> {
    const m = /^env:([A-Z0-9_]{3,100})$/.exec(ref);
    if (!m) throw new Error("référence d'identifiants invalide");
    const raw = this.env[m[1]!];
    if (!raw) throw new Error(`identifiants absents : ${m[1]}`);
    return JSON.parse(raw) as ProviderCredentials;
  }
}

/** Tests et faux fournisseur : identifiants fixés en mémoire. */
export class MemoryCredentialStore implements CredentialStore {
  constructor(private readonly values: Record<string, ProviderCredentials>) {}
  async get(ref: string) {
    const v = this.values[ref];
    if (!v) throw new Error(`identifiants absents : ${ref}`);
    return v;
  }
}
