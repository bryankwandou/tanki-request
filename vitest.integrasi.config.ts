import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.join(__dirname, "src") } },
  test: {
    include: ["uji-integrasi/*.integrasi.spec-int.ts"],
    setupFiles: ["uji-integrasi/setup.integrasi.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
