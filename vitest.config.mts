import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testkonfiguration: reine Logik-Tests ohne Browser-Umgebung und ohne Netzwerk.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
