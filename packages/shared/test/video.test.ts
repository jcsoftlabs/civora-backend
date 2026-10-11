import { describe, expect, it } from "vitest";
import { videoEmbed } from "../src/video.js";

describe("videoEmbed", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?t=42",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  ])("YouTube : %s", (url) => {
    expect(videoEmbed(url)).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
  });

  it("Vimeo, public et non répertorié", () => {
    expect(videoEmbed("https://vimeo.com/76979871")).toEqual({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/76979871",
    });
    expect(videoEmbed("https://vimeo.com/76979871/8272103f6e")?.embedUrl).toBe(
      "https://player.vimeo.com/video/76979871?h=8272103f6e",
    );
    expect(videoEmbed("https://player.vimeo.com/video/76979871?h=8272103f6e")?.embedUrl).toBe(
      "https://player.vimeo.com/video/76979871?h=8272103f6e",
    );
  });

  it.each([
    "pas un lien",
    "javascript:alert(1)",
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=court",
    "https://vimeo.com/channels/staffpicks",
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>',
  ])("refusé : %s", (url) => {
    expect(videoEmbed(url)).toBeNull();
  });
});
