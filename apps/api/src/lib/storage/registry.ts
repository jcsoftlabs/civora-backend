import type { Config } from "../../config.js";
import { LocalStorage, localStorageRoot } from "./local.js";
import { R2Storage } from "./r2.js";
import type { ObjectStorage } from "./types.js";

/** R2 dès que ses identifiants sont configurés ; sinon stockage local (développement uniquement). */
export function buildStorage(config: Config): ObjectStorage {
  if (config.R2_ACCOUNT_ID && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY && config.R2_BUCKET) {
    return new R2Storage({
      accountId: config.R2_ACCOUNT_ID,
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      bucket: config.R2_BUCKET,
    });
  }
  return new LocalStorage(localStorageRoot(), config.API_PUBLIC_URL);
}
