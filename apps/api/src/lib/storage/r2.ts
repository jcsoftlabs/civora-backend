import { presignUrl, type S3Credentials } from "./sigv4.js";
import type { ObjectStorage, StoredObject, UploadTicket } from "./types.js";

/** Cloudflare R2 par son API S3 (accès de chemin : https://<compte>.r2.cloudflarestorage.com/<bucket>/<clé>). */
export class R2Storage implements ObjectStorage {
  private readonly host: string;
  private readonly creds: S3Credentials;
  private readonly bucket: string;

  constructor(
    cfg: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.host = `${cfg.accountId}.r2.cloudflarestorage.com`;
    this.creds = { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region: "auto" };
    this.bucket = cfg.bucket;
  }

  private path(key: string) {
    return `/${this.bucket}/${key}`;
  }

  async presignUpload(key: string, contentType: string, expiresSeconds: number): Promise<UploadTicket> {
    const url = presignUrl(this.creds, {
      method: "PUT",
      host: this.host,
      path: this.path(key),
      expiresSeconds,
      headers: { "content-type": contentType },
    });
    return {
      url,
      method: "PUT",
      headers: { "content-type": contentType },
      expiresAt: new Date(Date.now() + expiresSeconds * 1000),
    };
  }

  async presignDownload(key: string, expiresSeconds: number, downloadName?: string): Promise<string> {
    return presignUrl(this.creds, {
      method: "GET",
      host: this.host,
      path: this.path(key),
      expiresSeconds,
      ...(downloadName
        ? { query: { "response-content-disposition": `inline; filename="${downloadName.replace(/["\\]/g, "")}"` } }
        : {}),
    });
  }

  async head(key: string): Promise<StoredObject | null> {
    const res = await this.fetchImpl(
      presignUrl(this.creds, { method: "HEAD", host: this.host, path: this.path(key), expiresSeconds: 60 }),
      { method: "HEAD" },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 : lecture des métadonnées refusée (${res.status})`);
    return { size: Number(res.headers.get("content-length") ?? 0), contentType: res.headers.get("content-type") };
  }

  async delete(key: string): Promise<void> {
    const res = await this.fetchImpl(
      presignUrl(this.creds, { method: "DELETE", host: this.host, path: this.path(key), expiresSeconds: 60 }),
      { method: "DELETE" },
    );
    if (!res.ok && res.status !== 404) throw new Error(`R2 : suppression refusée (${res.status})`);
  }
}
