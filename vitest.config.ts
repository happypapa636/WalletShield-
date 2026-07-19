import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    restoreMocks: true,
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
})
