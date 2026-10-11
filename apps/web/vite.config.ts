import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    // docs/design/tokens.css est importé depuis la racine du dépôt.
    fs: { allow: ["../../docs/design"] },
  },
  test: { include: ["src/**/*.test.ts"] },
});
