import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// En local, les URL de connexion viennent du .env racine ; en CI, des variables du workflow.
const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Les tests d'intégration partagent une seule base : pas d'exécution parallèle entre fichiers.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
