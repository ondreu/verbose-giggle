import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Alias workspace deps to their TS sources so server tests run without a build.
export default defineConfig({
  resolve: {
    alias: {
      "@adm/schemas": fileURLToPath(new URL("../../packages/schemas/src/index.ts", import.meta.url)),
      "@adm/srd": fileURLToPath(new URL("../../packages/srd/src/index.ts", import.meta.url)),
      "@adm/engine": fileURLToPath(new URL("../../packages/engine/src/index.ts", import.meta.url)),
    },
  },
});
