import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
