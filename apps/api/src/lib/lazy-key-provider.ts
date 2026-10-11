import { LocalKeyProvider, type KeyProvider } from "./crypto.js";

/** Lit la clé maîtresse au premier usage. server.ts la charge au démarrage pour échouer tôt si elle manque. */
export class LazyKeyProvider implements KeyProvider {
  private inner: KeyProvider | null = null;
  private get provider(): KeyProvider {
    return (this.inner ??= LocalKeyProvider.fromEnv());
  }
  wrap(dek: Buffer) {
    return this.provider.wrap(dek);
  }
  unwrap(wrapped: Buffer) {
    return this.provider.unwrap(wrapped);
  }
}
