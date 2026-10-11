// Configuration ESLint commune (flat config). Chaque paquet lance `eslint src`.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/build/**", "**/.svelte-kit/**", "**/migrations/**", "skills/**", "apps/mobile/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // SEC-08 : pas de console dans le code serveur, passer par le logger (masquage des données personnelles).
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { parser: tseslint.parser, extraFileExtensions: [".svelte"] },
    },
  },
  {
    files: ["**/scripts/**", "**/src/migrate.ts", "**/src/seed.ts", "**/src/demo.ts", "**/src/console-owner.ts"],
    rules: { "no-console": "off" },
  },
);
