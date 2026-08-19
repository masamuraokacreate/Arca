/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Windowsでの画像ロックによるEBUSYエラーを回避するため監視を除外
  server: {
    watch: {
      ignored: ['**/public/**'],
    },
  },
  // Vitest 設定
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Firebase / browser API をモックするため CSS は除外
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json"],
    },
  },
});
