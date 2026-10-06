/**
 * src/api/standaloneServer.ts
 * Arca — スタンドアロン HTTP API サーバー
 *
 * 用途:
 *  - Vite dev サーバーとは別に独立して API のみを提供したい場合に利用
 *  - Node.js 標準の http モジュールのみで動作（軽量・依存なし）
 *
 * 起動方法:
 *  - npx tsx src/api/standaloneServer.ts
 *  - または npm run api
 */

import { createServer } from "node:http";
import { handleScheduleApiRequest } from "./scheduleApiHandler";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

const server = createServer(async (req, res) => {
  try {
    const handled = await handleScheduleApiRequest(req, res);
    if (!handled) {
      if (req.url === "/health" || req.url === "/health/") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
        return;
      }

      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Not Found" }));
    }
  } catch (err: any) {
    console.error("[standaloneServer] Unhandled request error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Internal Server Error", message: err?.message }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[Arca API Server] Listening on http://${HOST}:${PORT}`);
  console.log(`[Arca API Server] Endpoint: GET http://${HOST}:${PORT}/api/v1/schedule/next-holidays`);
});
