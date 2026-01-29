import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "/tmp/1ly-mcp-server-vite",
  test: {
    environment: "node",
    globals: false,
    restoreMocks: true,
    clearMocks: true,
  },
});
