import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Alias workspace deps to their TS sources so engine tests run without a build.
export default defineConfig({
  resolve: {
    alias: {
      "@adm/schemas": fileURLToPath(new URL("../schemas/src/index.ts", import.meta.url)),
      "@adm/srd": fileURLToPath(new URL("../srd/src/index.ts", import.meta.url)),
    },
  },
});
