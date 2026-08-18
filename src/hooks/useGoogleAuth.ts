import { useState, useEffect, useRef, useCallback } from "react";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SCOPE = "https://www.googleapis.com/auth/tasks";
const LS_TOKEN  = "arca_g_token";
const LS_EXPIRY = "arca_g_expiry";

export interface GoogleAuthState {
  accessToken: string | null;
  isSignedIn: boolean;
  isReady: boolean;
  signIn: () => void;
  signOut: () => void;
}

// ---------- localStorage ユーティリティ ----------

function loadSavedToken(): string | null {
  try {
    const token  = localStorage.getItem(LS_TOKEN);
    const expiry = localStorage.getItem(LS_EXPIRY);
    if (token && expiry && Date.now() < parseInt(expiry, 10)) return token;
  } catch { /* no-op */ }
  clearSavedToken();
  return null;
}

function saveToken(token: string, expiresIn: number): void {
  try {
    localStorage.setItem(LS_TOKEN,  token);
    localStorage.setItem(LS_EXPIRY, String(Date.now() + (expiresIn - 60) * 1000));
  } catch { /* no-op */ }
}

function clearSavedToken(): void {
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
          console.error("Google OAuth error:", resp.error_description);
          clearSavedToken();
          setAccessToken(null);
          return;
        }
        // トークンを保存し、呼び出し元へ直接通知（Reactのdep経由ではなく命令型）
        saveToken(resp.access_token, resp.expires_in);
        setAccessToken(resp.access_token);
        onLoginRef.current?.(resp.access_token);
      },
      error_callback: (err) => {
        console.error("Google OAuth error_callback:", err);
        clearSavedToken();
        setAccessToken(null);
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

  // ---------- ログイン / ログアウト ----------
  const signIn = useCallback(() => {
    // 有効な保存済みトークンがあれば再認証不要
    const saved = loadSavedToken();
    if (saved) {
      setAccessToken(saved);
      // ここでは onLoginRef を呼ばない
      // → Lists側の mount useEffect([]) が既に処理済みのため
      return;
    }
    tokenClientRef.current?.requestAccessToken({ prompt: "consent" });
  }, []);

  const signOut = useCallback(() => {
    clearSavedToken();
    const cur = accessToken;
    setAccessToken(null);
    if (cur) google.accounts.oauth2.revoke(cur, () => {});
  }, [accessToken]);

  return { accessToken, isSignedIn: !!accessToken, isReady, signIn, signOut };
}
