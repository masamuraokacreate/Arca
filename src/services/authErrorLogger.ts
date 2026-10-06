/**
 * src/services/authErrorLogger.ts
 * 認証エラーログのFirestore保存・構造化コンソール出力ユーティリティ
 *
 * 目的:
 *  - iPad実機や特定環境で発生するGoogle認証エラー（ITP、ポップアップ遮断、ドメイン不一致等）の
 *    端末情報・エラー詳細をFirestore `auth_errors` コレクションに安全に収集する。
 *  - ユーザー未認証状態（request.auth == null）での書き込みに対応し、
 *    送信失敗時もメインUIをクラッシュさせない多層防御設計。
 */

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, firebaseConfig } from "../lib/firebase";
import { logger } from "./loggerService";

export interface AuthErrorContext {
  provider?: string;
  authMethod?: "signInWithPopup" | "signInWithRedirect" | string;
  [key: string]: unknown;
}

export interface AuthErrorPayload {
  timestamp: ReturnType<typeof serverTimestamp>;
  errorCode: string;
  errorMessage: string;
  userAgent: string;
  platform: string;
  screen: {
    innerWidth: number;
    innerHeight: number;
    devicePixelRatio: number;
    maxTouchPoints?: number;
  };
  maxTouchPoints?: number;
  currentUrl: string;
  authDomain: string;
  provider: string;
  authMethod: string;
}

/** 文字列の長さを安全に切り詰める */
function clampString(value: unknown, fallback: string, minLen: number, maxLen: number): string {
  const str = typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
  if (str.length < minLen) {
    return str.padEnd(minLen, " ");
  }
  return str.slice(0, maxLen);
}

/**
 * 認証エラーペイロードの構築
 */
export function buildAuthErrorPayload(
  error: unknown,
  context?: AuthErrorContext
): AuthErrorPayload {
  const errObj = (typeof error === "object" && error !== null ? error : {}) as {
    code?: unknown;
    message?: unknown;
    name?: unknown;
  };

  const rawCode = errObj.code || errObj.name || "unknown";
  const rawMessage =
    (typeof errObj.message === "string" && errObj.message.trim() ? errObj.message : null) ||
    (typeof error === "string" && error.trim() ? error : null) ||
    (error && typeof error === "object" ? JSON.stringify(error) : null) ||
    "Unknown authentication error";

  const errorCode = clampString(rawCode, "unknown", 1, 100);
  const errorMessage = clampString(rawMessage, "Unknown authentication error", 1, 2000);

  const rawUserAgent = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
  const userAgent = clampString(rawUserAgent, "unknown", 1, 500);

  const rawPlatform =
    typeof navigator !== "undefined"
      ? (navigator.platform || "unknown")
      : "unknown";
  const platform = clampString(rawPlatform, "unknown", 1, 100);

  const rawUrl = typeof window !== "undefined" ? window.location.href : "https://arca-f3fc6.web.app/";
  // firestore.rules の isValidUrl (http:// or https://) に適合させる
  const currentUrl =
    rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
      ? clampString(rawUrl, "https://arca-f3fc6.web.app/", 1, 2000)
      : "https://arca-f3fc6.web.app/";

  const authDomain = clampString(firebaseConfig.authDomain, "arca-f3fc6.firebaseapp.com", 1, 100);
  const provider = clampString(context?.provider, "google.com", 1, 50);
  const authMethod = clampString(context?.authMethod, "signInWithPopup", 1, 50);

  const innerWidth = typeof window !== "undefined" ? Math.max(0, Math.min(10000, window.innerWidth || 0)) : 0;
  const innerHeight = typeof window !== "undefined" ? Math.max(0, Math.min(10000, window.innerHeight || 0)) : 0;
  const devicePixelRatio = typeof window !== "undefined" ? Math.max(0, Math.min(20, window.devicePixelRatio || 1)) : 1;

  const maxTouchPoints =
    typeof navigator !== "undefined" && typeof navigator.maxTouchPoints === "number"
      ? Math.max(0, Math.min(50, navigator.maxTouchPoints))
      : 0;

  return {
    timestamp: serverTimestamp(),
    errorCode,
    errorMessage,
    userAgent,
    platform,
    screen: {
      innerWidth,
      innerHeight,
      devicePixelRatio,
      maxTouchPoints,
    },
    maxTouchPoints,
    currentUrl,
    authDomain,
    provider,
    authMethod,
  };
}

/**
 * 認証エラーログを Firestore `auth_errors` に送信し、コンソールにも詳細出力する
 *
 * @param error 発生したエラーオブジェクト（FirebaseError 等）
 * @param context 付加コンテキスト（provider, authMethod など）
 * @returns 作成されたドキュメントID（失敗時は null）
 */
export async function logAuthError(
  error: unknown,
  context?: AuthErrorContext
): Promise<string | null> {
  const payload = buildAuthErrorPayload(error, context);

  // 1. ブラウザコンソールへの構造化詳細出力（開発・デバッグ用）
  console.error("[AuthErrorLogger] Authentication error occurred:", {
    errorCode: payload.errorCode,
    errorMessage: payload.errorMessage,
    platform: payload.platform,
    authMethod: payload.authMethod,
    provider: payload.provider,
    screen: payload.screen,
    maxTouchPoints: payload.maxTouchPoints,
    userAgent: payload.userAgent,
    currentUrl: payload.currentUrl,
    authDomain: payload.authDomain,
    rawError: error,
  });

  // 2. システム内部ロガー（保守コンソール連動）
  try {
    logger.error("auth", `Auth error (${payload.errorCode}): ${payload.errorMessage}`, {
      authMethod: payload.authMethod,
      platform: payload.platform,
      maxTouchPoints: payload.maxTouchPoints,
      screen: payload.screen,
    });
  } catch {
    // 内部ロガーエラー無視
  }

  // 3. Firestore `auth_errors` コレクションへの永続化
  try {
    const docRef = await addDoc(collection(db, "auth_errors"), payload);
    console.info(`[AuthErrorLogger] Error log successfully written to Firestore: ${docRef.id}`);
    return docRef.id;
  } catch (firestoreErr) {
    // ログ送信失敗（オフライン・ルールエラー等）でもメインUIは絶対にクラッシュさせない
    console.error("[AuthErrorLogger] Failed to write auth error to Firestore:", firestoreErr);
    return null;
  }
}
