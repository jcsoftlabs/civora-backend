/**
 * Stockage des fichiers (DOC-01, ADH-01). Le client envoie le fichier directement au stockage avec une URL signée ;
 * l'API ne fait que délivrer les URL et vérifier l'objet reçu. Clés : party/<party_id>/<usage>/<file_id>.
 */
export interface StoredObject {
  size: number;
  contentType: string | null;
}

export interface UploadTicket {
  url: string;
  method: "PUT";
  /** En-têtes à envoyer tels quels avec le fichier (signés). */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface ObjectStorage {
  presignUpload(key: string, contentType: string, expiresSeconds: number): Promise<UploadTicket>;
  presignDownload(key: string, expiresSeconds: number, downloadName?: string): Promise<string>;
  head(key: string): Promise<StoredObject | null>;
  /** Contenu d'un petit fichier (logo, signature) lu par le serveur, par exemple pour un PDF. */
  read(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}
