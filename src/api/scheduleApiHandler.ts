/**
 * src/api/scheduleApiHandler.ts
 * Arca — スケジュール・次回休日取得 API ハンドラ
 *
 * エンドポイント:
 *   GET /api/v1/schedule/next-holidays
 *
 * 特徴:
 *  - Vite dev/preview サーバーミドルウェアおよびスタンドアロン Node.js HTTP サーバーの双方で動作可能
 *  - CORS 対応
 *  - オプションのクエリパラメータ ?date=YYYY-MM-DD または ?referenceDate=YYYY-MM-DD に対応
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchNextHolidaysData } from "../services/scheduleService";

/**
 * /api/v1/schedule/next-holidays の HTTP リクエストを処理する
 *
 * @param req Node.js または Connect の IncomingMessage
 * @param res Node.js または Connect の ServerResponse
 * @returns boolean リクエストが処理された場合は true、マッチしなかった場合は false
 */
export async function handleScheduleApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const urlString = req.url || "/";
  // 相対パスをダミーホストでパース
  const parsedUrl = new URL(urlString, "http://localhost");
  const pathname = parsedUrl.pathname;

  // CORS プリフライト対応
  if (req.method === "OPTIONS" && pathname.startsWith("/api/v1/schedule/")) {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.end();
    return true;
  }

  // GET /api/v1/schedule/next-holidays
  if (pathname === "/api/v1/schedule/next-holidays" || pathname === "/api/v1/schedule/next-holidays/") {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
      return true;
    }

    try {
      const dateParam =
        parsedUrl.searchParams.get("date") ||
        parsedUrl.searchParams.get("referenceDate") ||
        undefined;
      const anchorParam =
        parsedUrl.searchParams.get("anchor") ||
        parsedUrl.searchParams.get("anchorDate") ||
        undefined;

      const holidaysData = await fetchNextHolidaysData(dateParam, anchorParam);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-cache");
      res.end(JSON.stringify(holidaysData, null, 2));
      return true;
    } catch (err: any) {
      console.error("[scheduleApiHandler] Error handling /api/v1/schedule/next-holidays:", err);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(
        JSON.stringify({
          error: "Internal Server Error",
          message: err?.message || String(err),
        })
      );
      return true;
    }
  }

  return false;
}
