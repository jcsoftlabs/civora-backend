// FOR-01 : chapitre vidéo par lien YouTube ou Vimeo. Le lien collé est réduit à un lecteur intégrable connu,
// sans autre domaine possible : on n'intègre jamais une adresse fournie telle quelle.

export type VideoProvider = "youtube" | "vimeo";

export interface VideoEmbed {
  provider: VideoProvider;
  /** Adresse du lecteur à mettre dans un iframe (YouTube sans cookies). */
  embedUrl: string;
}

const YOUTUBE_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
];
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Lien YouTube ou Vimeo vers son lecteur intégrable ; null si le lien n'est pas reconnu. */
export function videoEmbed(input: string): VideoEmbed | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);

  let youtubeId: string | null = null;
  if (host === "youtu.be") youtubeId = parts[0] ?? null;
  else if (YOUTUBE_HOSTS.includes(host)) {
    if (parts[0] === "watch") youtubeId = u.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) youtubeId = parts[1] ?? null;
  }
  if (youtubeId !== null) {
    return YOUTUBE_ID.test(youtubeId)
      ? { provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}` }
      : null;
  }

  if (host === "vimeo.com" || host === "www.vimeo.com" || host === "player.vimeo.com") {
    // vimeo.com/123, vimeo.com/123/abcdef (vidéo non répertoriée), player.vimeo.com/video/123?h=abcdef
    const rest = host === "player.vimeo.com" ? (parts[0] === "video" ? parts.slice(1) : []) : parts;
    const id = rest[0];
    if (!id || !/^\d{6,12}$/.test(id)) return null;
    const hash = rest[1] ?? u.searchParams.get("h");
    const h = hash && /^[0-9a-f]{6,20}$/i.test(hash) ? `?h=${hash}` : "";
    return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}${h}` };
  }
  return null;
}
