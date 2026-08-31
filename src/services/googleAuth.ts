/**
 * src/services/googleAuth.ts
 * Google OAuth 2.0 認証サービス定数・トークン管理
 * 
/**
 * 要求スコープ:
 * - Google Calendar: https://www.googleapis.com/auth/calendar (カレンダー一覧・読み書き)
 * - Google Calendar Events: https://www.googleapis.com/auth/calendar.events
 * - Google Calendar Readonly: https://www.googleapis.com/auth/calendar.readonly
 * - Google Tasks: https://www.googleapis.com/auth/tasks
 * - Google Drive: https://www.googleapis.com/auth/drive.file
 */

export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

export const LS_TOKEN = "arca_g_token";
export const LS_EXPIRY = "arca_g_expiry";

/** 保存されている有効なアクセストークンを取得する */
export function loadSavedToken(): string | null {
  try {
    const token = localStorage.getItem(LS_TOKEN);
    const expiry = localStorage.getItem(LS_EXPIRY);
    if (token && expiry && Date.now() < parseInt(expiry, 10)) {
      return token;
    }
  } catch {
    // localStorage アクセス不可環境のフォールバック
  }
  clearSavedToken();
  return null;
}

/** アクセストークンと有効期限（秒）を保存する */
export function saveToken(token: string, expiresIn: number): void {
  try {
    localStorage.setItem(LS_TOKEN, token);
    // 有効期限の60秒前に期限切れとみなすマージン
    localStorage.setItem(LS_EXPIRY, String(Date.now() + (expiresIn - 60) * 1000));
  } catch {
    // localStorage エラー無視
  }
}

/** 保存されたアクセストークンを破棄する */
export function clearSavedToken(): void {
  try {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EXPIRY);
  } catch {
    // localStorage エラー無視
  }
}

import { syncGoogleCalendarToArca } from "./googleCalendarSync";
import { syncAllGoogleTasks } from "./googleTasksSync";

// ─── 全Googleサービス（カレンダー ＆ Todoタスク）の一括自動同期 ───
let isSyncAllInProgress = false;

/**
 * 有効なGoogleアクセストークンを用いて、カレンダーおよび全タスクリストを一度に同期する
 */
export async function syncAllGoogleData(token: string): Promise<{
  calendar: { added: number; updated: number };
  tasks: { added: number; updated: number };
}> {
  if (isSyncAllInProgress) {
    return { calendar: { added: 0, updated: 0 }, tasks: { added: 0, updated: 0 } };
  }
  isSyncAllInProgress = true;

  try {
    const [calendarRes, tasksRes] = await Promise.allSettled([
      syncGoogleCalendarToArca(token),
      syncAllGoogleTasks(token),
    ]);

    const calendar = calendarRes.status === "fulfilled" ? calendarRes.value : { added: 0, updated: 0 };
    const tasks = tasksRes.status === "fulfilled" ? tasksRes.value : { added: 0, updated: 0 };

    if (calendarRes.status === "rejected") {
      console.warn("[syncAllGoogleData] Calendar sync error:", calendarRes.reason);
    }
    if (tasksRes.status === "rejected") {
      console.warn("[syncAllGoogleData] Tasks sync error:", tasksRes.reason);
    }

    return { calendar, tasks };
  } finally {
    isSyncAllInProgress = false;
  }
}

