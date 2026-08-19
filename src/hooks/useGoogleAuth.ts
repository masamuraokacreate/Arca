import { useState, useEffect, useRef, useCallback } from "react";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SCOPE = "https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/drive.file";
const LS_TOKEN  = "arca_g_token";
const LS_EXPIRY = "arca_g_expiry";

export interface GoogleAuthState {
  accessToken: string | null;
  isSignedIn: boolean;
  isReady: boolean;
  signIn: () => void;
  signOut: () => void;
  requestAccessToken: (forcePrompt?: boolean) => Promise<string>;
}

// ---------- localStorage ユーティリティ ----------

export function loadSavedToken(): string | null {
  try {
    const token  = localStorage.getItem(LS_TOKEN);
    const expiry = localStorage.getItem(LS_EXPIRY);
    if (token && expiry && Date.now() < parseInt(expiry, 10)) return token;
  } catch { /* no-op */ }
  clearSavedToken();
  return null;
}

export function saveToken(token: string, expiresIn: number): void {
  try {
    localStorage.setItem(LS_TOKEN,  token);
    localStorage.setItem(LS_EXPIRY, String(Date.now() + (expiresIn - 60) * 1000));
  } catch { /* no-op */ }
}

export function clearSavedToken(): void {
  try {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EXPIRY);
  } catch { /* no-op */ }
}

// ---------- フック ----------

/**
 * GIS Token Model による認証フック。
 *
 * @param onLogin  新しいトークンが発行された時に呼び出されるコールバック。
 *                 useEffect の依存配列を経由せず、直接呼び出すことで
 *                 同期処理のトリガーをReactのレンダリングサイクルから切り離す。
 */
export function useGoogleAuth(
  onLogin?: (token: string) => void
): GoogleAuthState {
  const [accessToken, setAccessToken] = useState<string | null>(loadSavedToken);
  const [isReady, setIsReady]         = useState(false);
  const tokenClientRef  = useRef<TokenClient | null>(null);
  const initializedRef  = useRef(false);

  // 非同期アクセストークン要求待ちのリゾルバキュー
  const pendingResolversRef = useRef<
    { resolve: (token: string) => void; reject: (err: Error) => void }[]
  >([]);

  // ref 経由でコールバックを常に最新に保つ（deps を不安定にしない）
  const onLoginRef = useRef(onLogin);
  useEffect(() => { onLoginRef.current = onLogin; });

  // ---------- TokenClient 初期化 ----------
  const initTokenClient = useCallback(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    tokenClientRef.current = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp: TokenResponse) => {
        if (resp.error) {
          console.error("Google OAuth error:", resp.error_description || resp.error);
          clearSavedToken();
          setAccessToken(null);
          const err = new Error(resp.error_description || resp.error || "Google認証に失敗しました。");
          const resolvers = [...pendingResolversRef.current];
          pendingResolversRef.current = [];
          resolvers.forEach((r) => r.reject(err));
          return;
        }

        // トークンを保存し、呼び出し元へ直接通知（Reactのdep経由ではなく命令型）
        saveToken(resp.access_token, resp.expires_in);
        setAccessToken(resp.access_token);
        onLoginRef.current?.(resp.access_token);

        const resolvers = [...pendingResolversRef.current];
        pendingResolversRef.current = [];
        resolvers.forEach((r) => r.resolve(resp.access_token));
      },
      error_callback: (err) => {
        console.error("Google OAuth error_callback:", err);
        clearSavedToken();
        setAccessToken(null);
        const error = new Error(err?.message || "Google認証がキャンセルされたか失敗しました。");
        const resolvers = [...pendingResolversRef.current];
        pendingResolversRef.current = [];
        resolvers.forEach((r) => r.reject(error));
      },
    });
    setIsReady(true);
  }, []);

  // ---------- GIS スクリプト読み込み待機 ----------
  useEffect(() => {
    if (typeof google !== "undefined" && google.accounts) {
      initTokenClient();
      return;
    }
    const handler = () => initTokenClient();
    window.addEventListener("gsi-loaded", handler, { once: true });
    return () => window.removeEventListener("gsi-loaded", handler);
  }, [initTokenClient]);

  // ---------- 非同期アクセストークン取得 (Promise) ----------
  const requestAccessToken = useCallback(
    (forcePrompt = false): Promise<string> => {
      if (!forcePrompt) {
        const saved = loadSavedToken();
        if (saved) {
          setAccessToken(saved);
          return Promise.resolve(saved);
        }
      } else {
        clearSavedToken();
        setAccessToken(null);
      }

      if (!tokenClientRef.current) {
        return Promise.reject(new Error("Google認証クライアントの初期化中です。少々お待ちください。"));
      }

      return new Promise<string>((resolve, reject) => {
        pendingResolversRef.current.push({ resolve, reject });
        try {
          tokenClientRef.current?.requestAccessToken({
            prompt: forcePrompt ? "consent" : "",
          });
        } catch (e) {
          pendingResolversRef.current = pendingResolversRef.current.filter((r) => r.resolve !== resolve);
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    },
    []
  );

  // ---------- ログイン / ログアウト ----------
  const signIn = useCallback(() => {
    requestAccessToken(false).catch((err) => {
      console.warn("Sign in cancelled or failed:", err);
    });
  }, [requestAccessToken]);

  const signOut = useCallback(() => {
    clearSavedToken();
    const cur = accessToken;
    setAccessToken(null);
    if (cur) google.accounts.oauth2.revoke(cur, () => {});
  }, [accessToken]);

  return {
    accessToken,
    isSignedIn: !!accessToken,
    isReady,
    signIn,
    signOut,
    requestAccessToken,
  };
}
