import { ApiFailure, api } from "./api";

/** Types et tailles admis côté web, alignés sur l'API (qui revérifie tout). */
export const UPLOAD_RULES = {
  party_logo: { types: ["image/png", "image/jpeg", "image/webp"], max: () => 2 * 1024 * 1024 },
  publication_media: {
    types: ["image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/mp4", "audio/aac", "audio/x-m4a"],
    max: (type: string) => (type.startsWith("audio/") ? 100 : 10) * 1024 * 1024,
  },
  signature: { types: ["image/png", "image/jpeg"], max: () => 1024 * 1024 },
  card_background: { types: ["image/png", "image/jpeg", "image/webp"], max: () => 5 * 1024 * 1024 },
  /** Fichier de membres à importer (ADH-07) : Excel ou CSV. */
  member_import: {
    types: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"],
    max: () => 10 * 1024 * 1024,
  },
  training_media: {
    types: [
      "video/mp4",
      "video/webm",
      "audio/mpeg",
      "audio/mp4",
      "audio/aac",
      "audio/x-m4a",
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ],
    max: (type: string) => (type.startsWith("video/") ? 300 : type.startsWith("audio/") ? 100 : 25) * 1024 * 1024,
  },
} as const;

/**
 * Envoi d'un fichier par le serveur web (le navigateur n'accède jamais au stockage) : demande d'envoi,
 * dépôt sur l'URL signée, vérification par l'API. Renvoie l'identifiant du fichier prêt.
 */
export async function uploadFile(
  file: File,
  purpose: keyof typeof UPLOAD_RULES,
  auth: { token: string; ip: string },
): Promise<string> {
  const rule = UPLOAD_RULES[purpose];
  if (!(rule.types as readonly string[]).includes(file.type)) throw new ApiFailure(400, "file_type_not_allowed");
  if (file.size === 0) throw new ApiFailure(400, "invalid_request");
  if (file.size > rule.max(file.type)) throw new ApiFailure(413, "file_too_large");
  const ticket = await api<{
    fileId: string;
    upload: { url: string; method: string; headers: Record<string, string> };
  }>("/files/uploads", {
    body: { purpose, name: file.name.slice(0, 120) || "fichier", mimeType: file.type, sizeBytes: file.size },
    ...auth,
  });
  const put = await fetch(ticket.upload.url, {
    method: ticket.upload.method,
    headers: ticket.upload.headers,
    body: Buffer.from(await file.arrayBuffer()),
  });
  if (!put.ok) throw new ApiFailure(502, "upload_failed");
  await api(`/files/${ticket.fileId}/complete`, { method: "POST", body: {}, ...auth });
  return ticket.fileId;
}
