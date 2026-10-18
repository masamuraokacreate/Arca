/**
 * src/services/googleAuth.ts
 * Google OAuth 2.0 認証サービス定数・トークン自動更新管理（Phase 2: Cloud Functions 連携）
 */

export {
  REQUIRED_SCOPE,
  GOOGLE_OAUTH_SCOPES,
  LS_TOKEN,
  LS_EXPIRY,
  LS_SCOPE,
  LS_CONNECTED,
  TOKEN_REFRESH_BUFFER_MS,
  GOOGLE_AUTH_CHANGED_EVENT,
  GOOGLE_REAUTH_REQUIRED_EVENT,
  loadSavedToken,
  getSavedToken,
  saveToken,
  saveTokenWithExpiry,
  clearSavedToken,
  clearGoogleConnection,
  wasGoogleConnected,
  hasWritePermission,
  exchangeAuthCode,
  getValidAccessToken,
  resolveValidAccessToken,
  notifyReauthRequired,
  requestWritePermission,
  type ExchangeAuthCodeResult,
} from "./googleAuthService";

import { resolveValidAccessToken } from "./googleAuthService";
import { syncGoogleCalendarToArca } from "./googleCalendarSync";
import { syncAllGoogleTasks } from "./googleTasksSync";

// ─── 全Googleサービス（カレンダー ＆ Todoタスク）の一括自動同期 ───
let isSyncAllInProgress = false;

/**
 * 有効なGoogleアクセストークンを用いて、カレンダーおよび全タスクリストを一度に同期する。
 * 引数 token が省略または期限切れ間近の場合は getValidAccessToken() で自動更新する。
 */
export async function syncAllGoogleData(token?: string | null): Promise<{
  calendar: { added: number; updated: number };
  tasks: { added: number; updated: number };
}> {
  if (isSyncAllInProgress) {
    return { calendar: { added: 0, updated: 0 }, tasks: { added: 0, updated: 0 } };
  }
  isSyncAllInProgress = true;

  try {
    const activeToken =
      token && token !== localStorage.getItem("arca_g_token")
        ? token
        : await resolveValidAccessToken(token);
    if (!activeToken) {
      return { calendar: { added: 0, updated: 0 }, tasks: { added: 0, updated: 0 } };
    }

    const [calendarRes, tasksRes] = await Promise.allSettled([
      syncGoogleCalendarToArca(activeToken),
      syncAllGoogleTasks(activeToken),
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
