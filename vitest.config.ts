import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Mirror the "@/*" → repo-root alias from tsconfig.json so tests can import
    // modules the same way the app does (e.g. "@/lib/productLogic").
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts", "**/*.{test,spec}.ts"],
  },
});
