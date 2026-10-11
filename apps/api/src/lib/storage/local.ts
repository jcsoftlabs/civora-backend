import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ObjectStorage, StoredObject, UploadTicket } from "./types.js";

/**
 * Stockage local pour le développement et les tests : même parcours que R2 (URL signées à durée limitée,
 * vérification après envoi), fichiers dans un dossier. Les URL pointent vers l'API (routes /storage/local).
 * Interdit en production.
 */
export class LocalStorage implements ObjectStorage {
  private readonly secret = randomBytes(32);

  constructor(
    private readonly root: string,
    private readonly baseUrl: string,
  ) {
    if (process.env.NODE_ENV === "production") throw new Error("LocalStorage interdit en production");
  }

  private file(key: string) {
    const p = resolve(this.root, key);
    if (!p.startsWith(resolve(this.root))) throw new Error("clé invalide");
    return p;
  }

  sign(method: string, key: string, exp: number, contentType = ""): string {
    return createHmac("sha256", this.secret).update(`${method}\n${key}\n${exp}\n${contentType}`).digest("hex");
  }

  /** Vérifie une URL signée reçue par les routes /storage/local. */
  verify(method: string, key: string, exp: number, sig: string, contentType = ""): boolean {
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
    const a = Buffer.from(this.sign(method, key, exp, contentType));
    const b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private url(method: string, key: string, expiresSeconds: number, contentType = "") {
    const exp = Math.floor(Date.now() / 1000) + expiresSeconds;
    return `${this.baseUrl}/storage/local/${encodeURIComponent(key)}?exp=${exp}&sig=${this.sign(method, key, exp, contentType)}`;
  }

  async presignUpload(key: string, contentType: string, expiresSeconds: number): Promise<UploadTicket> {
    return {
      url: this.url("PUT", key, expiresSeconds, contentType),
      method: "PUT",
      headers: { "content-type": contentType },
      expiresAt: new Date(Date.now() + expiresSeconds * 1000),
    };
  }
  async presignDownload(key: string, expiresSeconds: number): Promise<string> {
    return this.url("GET", key, expiresSeconds);
  }
  async put(key: string, body: Buffer, contentType: string) {
    const p = this.file(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
    await writeFile(`${p}.type`, contentType);
  }
  async read(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    try {
      return {
        body: await readFile(this.file(key)),
        contentType: (await readFile(`${this.file(key)}.type`, "utf8")) || "application/octet-stream",
      };
    } catch {
      return null;
    }
  }
  async head(key: string): Promise<StoredObject | null> {
    try {
      const s = await stat(this.file(key));
      return { size: s.size, contentType: await readFile(`${this.file(key)}.type`, "utf8").catch(() => null) };
    } catch {
      return null;
    }
  }
  async delete(key: string): Promise<void> {
    await rm(this.file(key), { force: true });
    await rm(`${this.file(key)}.type`, { force: true });
  }
}

export const localStorageRoot = (cwd = process.cwd()) => join(cwd, ".storage");
