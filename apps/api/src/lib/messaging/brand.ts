// Identité d'un parti pour ses e-mails : nom, couleur et logo, lus une fois puis gardés quelques minutes.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { files, parties, withParty } from "@civora/db";
import type { ObjectStorage } from "../storage/types.js";
import type { Brand } from "./mail.js";

/** Formats affichés par toutes les messageries ; un logo trop lourd est laissé de côté (nom du parti à la place). */
const LOGO_TYPES = ["image/png", "image/jpeg", "image/gif"];
const LOGO_MAX_BYTES = 300 * 1024;
const TTL_MS = 5 * 60_000;

let storage: ObjectStorage | null = null;
const cache = new Map<string, { at: number; brand: Brand }>();

/** Le stockage sert à lire le logo ; sans lui, l'en-tête porte le nom du parti. */
export function configureBrands(s: ObjectStorage | null) {
  storage = s;
  cache.clear();
}

export async function partyBrand(partyId: string): Promise<Brand> {
  const hit = cache.get(partyId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.brand;
  const brand = await withParty(partyId, async (tx) => {
    const [p] = await tx
      .select({ name: parties.name, color: parties.brandColor, logoFileId: parties.logoFileId })
      .from(parties);
    let logo: Brand["logo"] = null;
    if (p?.logoFileId && storage) {
      const [f] = await tx
        .select({ key: files.r2Key, mimeType: files.mimeType, size: files.sizeBytes })
        .from(files)
        .where(
          and(
            eq(files.id, p.logoFileId),
            eq(files.purpose, "party_logo"),
            eq(files.uploadStatus, "ready"),
            isNull(files.trashedAt),
            inArray(files.mimeType, LOGO_TYPES),
          ),
        );
      if (f && (f.size ?? 0) <= LOGO_MAX_BYTES) {
        const obj = await storage.read(f.key).catch(() => null);
        if (obj && obj.body.length <= LOGO_MAX_BYTES) logo = { content: obj.body, contentType: f.mimeType };
      }
    }
    return { kind: "party", name: p?.name ?? "", color: p?.color ?? "#0F6E66", logo } satisfies Brand;
  });
  cache.set(partyId, { at: Date.now(), brand });
  return brand;
}
