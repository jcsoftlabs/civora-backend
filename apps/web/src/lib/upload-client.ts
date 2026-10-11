// Envoi direct d'un fichier depuis le navigateur vers le stockage (R2, ou le stockage local en développement),
// avec la progression : utile pour une vidéo sur une connexion lente. Le serveur web signe et vérifie seulement.
import { resolve } from "$app/paths";

export class UploadError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export async function uploadDirect(
  file: File,
  purpose: "training_media" | "publication_media",
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const ticketRes = await fetch(resolve("/admin/fichiers"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ purpose, name: file.name, mimeType: file.type, sizeBytes: file.size }),
  });
  const ticket = (await ticketRes.json().catch(() => ({}))) as {
    fileId?: string;
    upload?: { url: string; method: string; headers: Record<string, string> };
    code?: string;
  };
  if (!ticketRes.ok || !ticket.fileId || !ticket.upload) throw new UploadError(ticket.code ?? "upload_failed");

  await new Promise<void>((done, fail) => {
    const xhr = new XMLHttpRequest();
    xhr.open(ticket.upload!.method, ticket.upload!.url);
    for (const [k, v] of Object.entries(ticket.upload!.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? done() : fail(new UploadError("upload_failed")));
    xhr.onerror = () => fail(new UploadError("upload_failed"));
    xhr.send(file);
  });

  const end = await fetch(resolve("/admin/(app)/fichiers/[id]/fin", { id: ticket.fileId }), { method: "POST" });
  if (!end.ok)
    throw new UploadError(((await end.json().catch(() => ({}))) as { code?: string }).code ?? "upload_failed");
  return ticket.fileId;
}
