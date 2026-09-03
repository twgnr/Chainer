import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Zwei Testumgebungen nebeneinander:
 *
 *  - `logik`   – Node, ohne Browser. Alles unter `src/lib` und die API-Routen.
 *  - `ansicht` – jsdom mit React Testing Library. Nur `*.test.tsx`, also die
 *                Komponenten. Sie brauchen ein DOM, der Rest nicht; eine
 *                gemeinsame jsdom-Umgebung wäre nur langsamer.
 *
 * Kein Test greift auf Netz oder Datenbank zu.
 */
const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "logik",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "ansicht",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.tsx"],
        },
      },
    ],
  },
});
