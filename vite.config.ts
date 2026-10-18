import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";
import { scheduleApiPlugin } from "./src/api/vitePluginScheduleApi.ts";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    scheduleApiPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["Arca_logo.png", "favicon.ico"],
      manifest: {
        name: "Arca - Personal OS",
        short_name: "Arca",
        description: "Minimalist Personal Operating System",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait-primary",
        icons: [
          {
            src: "/Arca_logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
      },
    }),
  ],
  // 開発サーバー設定（HTTPS対応 & ホスト公開 & Cloud Functions 認証APIプロキシ）
  server: {
    host: true,
    proxy: {
      "/api/v1/auth/google": {
        target: process.env.VITE_AUTH_API_PROXY_TARGET || "https://arca-f3fc6.web.app",
        changeOrigin: true,
        secure: true,
      },
    },
    watch: {
      ignored: ["**/public/**"],
    },
  },
  // プレビューサーバー設定（HTTPS対応 & ホスト公開）
  preview: {
    host: true,
  },
});

