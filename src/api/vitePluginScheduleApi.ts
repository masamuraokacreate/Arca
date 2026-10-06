/**
 * src/api/vitePluginScheduleApi.ts
 * Arca — Vite 開発サーバー用 API プラグイン
 *
 * GET /api/v1/schedule/next-holidays を Vite 開発サーバーで提供
 */

import type { Plugin } from "vite";

export function scheduleApiPlugin(): Plugin {
  return {
    name: "vite-plugin-schedule-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const mod = await server.ssrLoadModule("/src/api/scheduleApiHandler.ts");
          const handled = await mod.handleScheduleApiRequest(req, res);
          if (!handled) {
            next();
          }
        } catch (err) {
          next(err);
        }
      });
    },
  };
}
