/**
 * functions/src/index.ts
 * Phase 2: Google OAuth 2.0 認可コード交換 (exchange) ＆ トークン自動更新 (refresh) API
 *
 * エンドポイント（Firebase Hosting Rewrites 経由）:
 *  - POST /api/v1/auth/google/exchange
 *      Body: { code: string }
 *      処理: Google Token Endpoint で認可コードを交換し、refreshToken を Firestore (system_secrets/google_oauth) に保存。
 *      返却: { accessToken: string, expiresAt: number, scope?: string }
 *
 *  - POST /api/v1/auth/google/refresh
 *      Header: Authorization: Bearer <Firebase_ID_Token>
 *      処理: Firestore (system_secrets/google_oauth) から refreshToken を読み出し、新しい accessToken を取得。
 *      返却: { accessToken: string, expiresAt: number, scope?: string }
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const ALLOWED_ADMIN_EMAILS = new Set<string>([
  "masatomuraoka1028@gmail.com",
  "masatomuraoka.create@gmail.com",
]);

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SECRET_COLLECTION = "system_secrets";
const SECRET_DOC_ID = "google_oauth";

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

/**
 * Authorization ヘッダーから Bearer トークンを取り出す
 */
function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export const googleAuthApi = onRequest(
  {
    region: "asia-northeast1",
    cors: true,
  },
  async (req, res) => {
    // プリフライトリクエスト対応
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({
        error: "method_not_allowed",
        message: "POST メソッドのみ許可されています。",
      });
      return;
    }

    // 1. Firebase Auth ID トークンの検証 ＆ 管理者メールアドレスの厳格なチェック
    const idToken = extractBearerToken(req.headers.authorization);
    if (!idToken) {
      res.status(401).json({
        error: "unauthorized",
        message: "Authorization Bearer トークンが必要です。",
      });
      return;
    }

    let decodedToken: admin.auth.DecodedIdToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (verifyErr) {
      logger.warn("[googleAuthApi] Invalid Firebase ID token", verifyErr);
      res.status(401).json({
        error: "invalid_id_token",
        message: "Firebase ID トークンの検証に失敗しました。",
      });
      return;
    }

    const userEmail = (decodedToken.email || "").toLowerCase();
    if (!userEmail || !ALLOWED_ADMIN_EMAILS.has(userEmail)) {
      logger.warn("[googleAuthApi] Forbidden access attempt by email:", userEmail);
      res.status(403).json({
        error: "forbidden",
        message: "許可された管理者アカウントではありません。",
      });
      return;
    }

    // 2. Cloud Functions 環境変数の確認
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

    if (!clientId || !clientSecret) {
      logger.error(
        "[googleAuthApi] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in functions/.env"
      );
      res.status(500).json({
        error: "server_configuration_error",
        message:
          "サーバー側の GOOGLE_CLIENT_ID または GOOGLE_CLIENT_SECRET が未設定です。functions/.env を確認してください。",
      });
      return;
    }

    const requestPath = (req.path || req.url || "").split("?")[0];
    const db = admin.firestore();
    const secretDocRef = db.collection(SECRET_COLLECTION).doc(SECRET_DOC_ID);

    // ─────────────────────────────────────────────────────────────────
    // A. POST /api/v1/auth/google/exchange — 認可コード交換 ＆ リフレッシュトークン保存
    // ─────────────────────────────────────────────────────────────────
    if (
      requestPath === "/api/v1/auth/google/exchange" ||
      requestPath.endsWith("/exchange")
    ) {
      const code =
        typeof req.body?.code === "string" ? req.body.code.trim() : "";

      if (!code) {
        res.status(400).json({
          error: "invalid_request",
          message: "認可コード (code) が指定されていません。",
        });
        return;
      }

      try {
        const params = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: "postmessage",
        });

        const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        });

        const tokenData = (await tokenRes.json()) as GoogleTokenResponse;

        if (!tokenRes.ok || !tokenData.access_token) {
          logger.error("[googleAuthApi] Code exchange failed:", {
            status: tokenRes.status,
            error: tokenData.error,
            error_description: tokenData.error_description,
          });
          res.status(tokenRes.status >= 400 ? tokenRes.status : 400).json({
            error: tokenData.error || "exchange_failed",
            message:
              tokenData.error_description ||
              "Google 認可コードのトークン交換に失敗しました。",
          });
          return;
        }

        const now = Date.now();
        const expiresInSec = Number(tokenData.expires_in) || 3600;
        const expiresAt = now + expiresInSec * 1000;

        // refresh_token を Firestore の system_secrets/google_oauth に保存
        const secretPayload: Record<string, unknown> = {
          updatedAt: now,
        };
        if (tokenData.refresh_token) {
          secretPayload.refreshToken = tokenData.refresh_token;
        }

        await secretDocRef.set(secretPayload, { merge: true });

        res.status(200).json({
          accessToken: tokenData.access_token,
          expiresAt,
          ...(tokenData.scope ? { scope: tokenData.scope } : {}),
        });
        return;
      } catch (err) {
        logger.error("[googleAuthApi] Unexpected error during exchange:", err);
        res.status(500).json({
          error: "internal_error",
          message: "認可コード交換中にサーバーエラーが発生しました。",
        });
        return;
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // B. POST /api/v1/auth/google/refresh — 保存済みリフレッシュトークンで自動更新
    // ─────────────────────────────────────────────────────────────────
    if (
      requestPath === "/api/v1/auth/google/refresh" ||
      requestPath.endsWith("/refresh")
    ) {
      try {
        const docSnap = await secretDocRef.get();
        const secretData = docSnap.exists ? docSnap.data() : undefined;
        const refreshToken =
          typeof secretData?.refreshToken === "string"
            ? secretData.refreshToken.trim()
            : "";

        if (!refreshToken) {
          res.status(401).json({
            error: "refresh_token_missing",
            requireReauth: true,
            message: "Google連携の再認証が必要です",
          });
          return;
        }

        const params = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        });

        const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        });

        const tokenData = (await tokenRes.json()) as GoogleTokenResponse;

        if (!tokenRes.ok || !tokenData.access_token) {
          logger.warn("[googleAuthApi] Refresh token grant failed:", {
            status: tokenRes.status,
            error: tokenData.error,
            error_description: tokenData.error_description,
          });
          const isInvalidGrant =
            tokenData.error === "invalid_grant" ||
            tokenRes.status === 400 ||
            tokenRes.status === 401;

          res.status(isInvalidGrant ? 401 : tokenRes.status || 500).json({
            error: tokenData.error || "refresh_failed",
            requireReauth: isInvalidGrant,
            message: isInvalidGrant
              ? "Google連携の再認証が必要です"
              : tokenData.error_description ||
                "アクセストークンの自動更新に失敗しました。",
          });
          return;
        }

        const now = Date.now();
        const expiresInSec = Number(tokenData.expires_in) || 3600;
        const expiresAt = now + expiresInSec * 1000;

        // Google 側から新しい refresh_token がローテーション返却された場合は上書き保存
        if (tokenData.refresh_token) {
          await secretDocRef.set(
            {
              refreshToken: tokenData.refresh_token,
              updatedAt: now,
            },
            { merge: true }
          );
        } else {
          await secretDocRef.set({ updatedAt: now }, { merge: true });
        }

        res.status(200).json({
          accessToken: tokenData.access_token,
          expiresAt,
          ...(tokenData.scope ? { scope: tokenData.scope } : {}),
        });
        return;
      } catch (err) {
        logger.error("[googleAuthApi] Unexpected error during refresh:", err);
        res.status(500).json({
          error: "internal_error",
          message: "トークン更新中にサーバーエラーが発生しました。",
        });
        return;
      }
    }

    res.status(404).json({
      error: "not_found",
      message: `未定義のエンドポイントです: ${requestPath}`,
    });
  }
);
