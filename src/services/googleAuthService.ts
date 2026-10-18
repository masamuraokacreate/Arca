/**
 * src/services/googleAuthService.ts
 * Google OAuth 2.0 認証スコープ管理・認可コード交換・アクセストークン完全自動更新サービス (Phase 2)
 */

import { REQUIRED_SCOPE } from "../types";
import { auth } from "../lib/firebase";

export { REQUIRED_SCOPE };

/**
 * 要求スコープ一覧:
 * - Google Calendar Events (書き込み必須スコープ): https://www.googleapis.com/auth/calendar.events
 * - Google Calendar: https://www.googleapis.com/auth/calendar
 * - Google Tasks: https://www.googleapis.com/auth/tasks
 * - Google Drive: https://www.googleapis.com/auth/drive.file
 * - Gmail Readonly: https://www.googleapis.com/auth/gmail.readonly
 *
 * ※ 読み取り専用スコープ (calendar.readonly) は除外し、書き込み可能な calendar.events を使用する
 */
export const GOOGLE_OAUTH_SCOPES: string[] = [
  REQUIRED_SCOPE,
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export const LS_TOKEN = "arca_g_token";
export const LS_EXPIRY = "arca_g_expiry";
export const LS_SCOPE = "arca_g_scope";
export const LS_CONNECTED = "arca_g_connected";

/** 有効期限の5分前（300,000ms）からは自動リフレッシュ対象とする */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** トークン更新をアプリ内の全フックへ即時伝播するカスタムイベント名 */
export const GOOGLE_AUTH_CHANGED_EVENT = "arca-google-auth-changed";

/** リフレッシュトークン自体が無効化され再認証が必要な際に通知するカスタムイベント名 */
export const GOOGLE_REAUTH_REQUIRED_EVENT = "arca-google-reauth-required";

/** Single-flight（重複リフレッシュリクエスト防止）用 Promise ロック変数 */
let refreshPromise: Promise<string | null> | null = null;

function notifyAuthChanged(token: string | null): void {
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent<{ token: string | null }>(GOOGLE_AUTH_CHANGED_EVENT, {
          detail: { token },
        })
      );
    } catch {
      // イベント送出失敗時は無視
    }
  }
}

export function notifyReauthRequired(
  message: string = "Google連携の再認証が必要です"
): void {
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent<{ message: string; requireReauth: boolean }>(
          GOOGLE_REAUTH_REQUIRED_EVENT,
          {
            detail: { message, requireReauth: true },
          }
        )
      );
    } catch {
      // イベント送出失敗時は無視
    }
  }
}

/**
 * Firebase Auth の現在のユーザーから ID トークンを取得する
 */
async function getFirebaseIdToken(): Promise<string | null> {
  try {
    const currentUser = auth?.currentUser;
    if (!currentUser || typeof currentUser.getIdToken !== "function") {
      return null;
    }
    return await currentUser.getIdToken();
  } catch (err) {
    console.warn("[googleAuthService] Failed to get Firebase ID token:", err);
    return null;
  }
}

/** 保存されている有効なアクセストークンを同期的に取得する（期限切れ時は null） */
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

/** loadSavedToken のエイリアス */
export const getSavedToken = loadSavedToken;

/** アクセストークン・有効期限タイムスタンプ（ミリ秒）・付与スコープを保存する */
export function saveTokenWithExpiry(
  token: string,
  expiresAt: number,
  grantedScope?: string
): void {
  try {
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem(LS_EXPIRY, String(expiresAt));
    localStorage.setItem(LS_CONNECTED, "true");
    if (grantedScope) {
      localStorage.setItem(LS_SCOPE, grantedScope);
    }
  } catch {
    // localStorage エラー無視
  }
  notifyAuthChanged(token);
}

/** アクセストークン・有効期限（秒）・付与スコープを保存する */
export function saveToken(
  token: string,
  expiresIn: number,
  grantedScope?: string
): void {
  const expiresAt = Date.now() + (expiresIn - 60) * 1000;
  saveTokenWithExpiry(token, expiresAt, grantedScope);
}

/** 保存されたアクセストークンを破棄する（連携履歴フラグは維持） */
export function clearSavedToken(): void {
  try {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EXPIRY);
    localStorage.removeItem(LS_SCOPE);
  } catch {
    // localStorage エラー無視
  }
  notifyAuthChanged(null);
}

/** 明示的なログアウト時に連携履歴フラグも含めて完全にクリアする */
export function clearGoogleConnection(): void {
  try {
    localStorage.removeItem(LS_CONNECTED);
  } catch {
    // localStorage エラー無視
  }
  clearSavedToken();
}

/** ユーザーが過去にGoogle連携を有効化していたかどうかを返す */
export function wasGoogleConnected(): boolean {
  try {
    return localStorage.getItem(LS_CONNECTED) === "true";
  } catch {
    return false;
  }
}

/**
 * 現在のトークンが Google Calendar 書き込み権限 (REQUIRED_SCOPE) を保持しているか確認する
 */
export function hasWritePermission(): boolean {
  const token = loadSavedToken();
  if (!token) return false;
  try {
    const savedScope = localStorage.getItem(LS_SCOPE);
    if (!savedScope) {
      // スコープ文字列が未保存の場合はトークン有効性のみ判定（実通信時の403で検出）
      return true;
    }
    const scopes = savedScope.split(/\s+/);
    return (
      scopes.includes(REQUIRED_SCOPE) ||
      scopes.includes("https://www.googleapis.com/auth/calendar")
    );
  } catch {
    return true;
  }
}

export interface ExchangeAuthCodeResult {
  accessToken: string;
  expiresAt: number;
  scope?: string;
}

/**
 * Google OAuth 2.0 認可コード (code) を Cloud Functions (/api/v1/auth/google/exchange) へ送信し、
 * リフレッシュトークンを Firestore (system_secrets/google_oauth) に保存するとともに
 * アクセストークンと有効期限を localStorage に保存する。
 */
export async function exchangeAuthCode(
  code: string
): Promise<ExchangeAuthCodeResult> {
  const idToken = await getFirebaseIdToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const response = await fetch("/api/v1/auth/google/exchange", {
    method: "POST",
    headers,
    body: JSON.stringify({ code }),
  });

  let data: {
    accessToken?: string;
    expiresAt?: number;
    scope?: string;
    error?: string;
    message?: string;
  } = {};
  try {
    data = await response.json();
  } catch {
    // JSON パース失敗時は空オブジェクト
  }

  if (!response.ok || !data.accessToken) {
    throw new Error(
      data.message ||
        data.error ||
        `Google認可コードの交換に失敗しました (${response.status})`
    );
  }

  const expiresAt =
    typeof data.expiresAt === "number"
      ? data.expiresAt
      : Date.now() + 3600 * 1000;

  saveTokenWithExpiry(data.accessToken, expiresAt, data.scope);

  return {
    accessToken: data.accessToken,
    expiresAt,
    scope: data.scope,
  };
}

/**
 * 有効な Google アクセストークンを非同期で取得する（Phase 2 自動更新基盤）。
 *
 * - localStorage の `arca_g_expiry` が現在時刻より5分以上未来であれば、そのまま `arca_g_token` を返す。
 * - 期限切れ（または残り5分未満）の場合、Single-flight（重複リクエスト防止用 Promise ロック `refreshPromise`）を用いて
 *   `POST /api/v1/auth/google/refresh` を1回だけ呼び出し、新しいトークンで localStorage を更新して返す。
 * - リフレッシュトークン自体が無効化されていた場合（401 / invalid_grant）は、控えめなトースト通知イベントを発火する。
 */
export async function getValidAccessToken(): Promise<string | null> {
  try {
    const token = localStorage.getItem(LS_TOKEN);
    const expiryRaw = localStorage.getItem(LS_EXPIRY);
    if (token && expiryRaw) {
      const expiresAt = parseInt(expiryRaw, 10);
      if (
        !Number.isNaN(expiresAt) &&
        expiresAt - Date.now() >= TOKEN_REFRESH_BUFFER_MS
      ) {
        return token;
      }
    }
  } catch {
    // localStorage 読み取りエラー時はリフレッシュへフォールバック
  }

  // Single-flight: 既にリフレッシュ通信中であれば同一の Promise を共有する
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async (): Promise<string | null> => {
    try {
      const idToken = await getFirebaseIdToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }

      const response = await fetch("/api/v1/auth/google/refresh", {
        method: "POST",
        headers,
      });

      if (!response || typeof response.json !== "function") {
        return null;
      }

      let data: {
        accessToken?: string;
        expiresAt?: number;
        scope?: string;
        requireReauth?: boolean;
        message?: string;
      } = {};
      try {
        data = await response.json();
      } catch {
        // ignore JSON parse error
      }

      if (!response.ok || !data?.accessToken) {
        clearSavedToken();
        if (
          response.status === 401 ||
          response.status === 403 ||
          data?.requireReauth
        ) {
          notifyReauthRequired(
            data?.message || "Google連携の再認証が必要です"
          );
        }
        return null;
      }

      const expiresAt =
        typeof data.expiresAt === "number"
          ? data.expiresAt
          : Date.now() + 3600 * 1000;

      saveTokenWithExpiry(data.accessToken, expiresAt, data.scope);
      return data.accessToken;
    } catch (err) {
      console.warn("[googleAuthService] Auto token refresh failed:", err);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * API クライアント共通のトークン解決ヘルパー
 * - 引数 tokenOverride が未指定、または localStorage 上の現在のトークンと同一（期限切れ間近の可能性あり）の場合は getValidAccessToken() で有効性を検証・自動更新する
 * - 明示的に別トークンが渡された場合（単体テスト等）はそのまま使用する
 */
export async function resolveValidAccessToken(
  tokenOverride?: string | null
): Promise<string | null> {
  if (tokenOverride) {
    let storedToken: string | null = null;
    try {
      storedToken = localStorage.getItem(LS_TOKEN);
    } catch {
      storedToken = null;
    }

    // localStorage のトークンと異なる明示的トークンが渡された場合はそのまま返却
    if (storedToken !== tokenOverride) {
      return tokenOverride;
    }

    // localStorage 由来のトークンの場合は5分前バッファを含め getValidAccessToken() で検証・自動更新
    const validToken = await getValidAccessToken();
    return validToken || loadSavedToken() || tokenOverride;
  }

  return await getValidAccessToken();
}

/**
 * 書き込み権限（https://www.googleapis.com/auth/calendar.events）およびオフラインアクセスへの再同意・再認証を実行する。
 * `initCodeClient`（`access_type: "offline"`, `prompt: "consent"`）で認可コードを取得し、
 * `/api/v1/auth/google/exchange` でトークン交換を行う。
 *
 * ※ ブラウザのポップアップブロックを回避するため、必ずユーザーのクリックイベント（onClick）から呼び出すこと。
 */
export function requestWritePermission(): Promise<string> {
  // 古い読み取り専用トークン・期限切れトークンをクリア
  clearSavedToken();

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

  return new Promise<string>((resolve, reject) => {
    if (typeof google === "undefined" || !google.accounts?.oauth2) {
      reject(new Error("Google認証クライアントが読み込まれていません。"));
      return;
    }

    try {
      if (typeof google.accounts.oauth2.initCodeClient === "function") {
        const codeClient = google.accounts.oauth2.initCodeClient({
          client_id: clientId,
          scope: GOOGLE_OAUTH_SCOPES.join(" "),
          ux_mode: "popup",
          access_type: "offline",
          prompt: "consent",
          callback: async (resp: CodeResponse) => {
            if (resp.error || !resp.code) {
              clearSavedToken();
              reject(
                new Error(
                  resp.error_description ||
                    resp.error ||
                    "Google再認証に失敗しました。"
                )
              );
              return;
            }
            try {
              const exchanged = await exchangeAuthCode(resp.code);
              resolve(exchanged.accessToken);
            } catch (exchangeErr) {
              clearSavedToken();
              reject(
                exchangeErr instanceof Error
                  ? exchangeErr
                  : new Error(String(exchangeErr))
              );
            }
          },
          error_callback: (err) => {
            clearSavedToken();
            reject(
              new Error(
                err?.message || "Google再認証がキャンセルされたか失敗しました。"
              )
            );
          },
        });

        codeClient.requestCode();
        return;
      }

      // フォールバック（テストモック等で initTokenClient のみ定義されている場合）
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_OAUTH_SCOPES.join(" "),
        callback: (resp: TokenResponse) => {
          if (resp.error) {
            clearSavedToken();
            reject(
              new Error(
                resp.error_description ||
                  resp.error ||
                  "Google再認証に失敗しました。"
              )
            );
            return;
          }
          saveToken(resp.access_token, resp.expires_in, resp.scope);
          resolve(resp.access_token);
        },
        error_callback: (err) => {
          clearSavedToken();
          reject(
            new Error(
              err?.message || "Google再認証がキャンセルされたか失敗しました。"
            )
          );
        },
      });

      tokenClient.requestAccessToken({ prompt: "consent" });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
