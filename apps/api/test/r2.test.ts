// Adaptateur R2 : URL de chemin vers le bucket, lecture des métadonnées, suppression idempotente.
import { describe, expect, it } from "vitest";
import { R2Storage } from "../src/lib/storage/r2.js";

const cfg = { accountId: "acc123", accessKeyId: "AKID", secretAccessKey: "secret", bucket: "civora-s1" };

describe("R2Storage", () => {
  it("signe un envoi avec le type du fichier, vers le bon bucket", async () => {
    const t = await new R2Storage(cfg).presignUpload("party/p/members/f", "image/png", 900);
    const u = new URL(t.url);
    expect(u.host).toBe("acc123.r2.cloudflarestorage.com");
    expect(u.pathname).toBe("/civora-s1/party/p/members/f");
    expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(t.headers).toEqual({ "content-type": "image/png" });
  });

  it("lit taille et type, et traite un objet absent ou déjà supprimé", async () => {
    const fetchImpl = (async (url: string, init: RequestInit) => {
      if (url.includes("absent")) return new Response(null, { status: 404 });
      if (init.method === "HEAD")
        return new Response(null, { status: 200, headers: { "content-length": "1004", "content-type": "image/png" } });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const s = new R2Storage(cfg, fetchImpl);
    expect(await s.head("party/p/members/f")).toEqual({ size: 1004, contentType: "image/png" });
    expect(await s.head("party/p/members/absent")).toBeNull();
    await expect(s.delete("party/p/members/absent")).resolves.toBeUndefined();
  });
});
