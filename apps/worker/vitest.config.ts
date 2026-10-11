import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: { include: ["test/**/*.test.ts"], fileParallelism: false, testTimeout: 60_000, hookTimeout: 60_000 },
});
