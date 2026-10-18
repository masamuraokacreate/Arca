import { useState, useEffect, useRef, useCallback } from "react";
import {
  REQUIRED_SCOPE,
  GOOGLE_OAUTH_SCOPES,
  GOOGLE_AUTH_CHANGED_EVENT,
  loadSavedToken,
  saveToken,
  saveTokenWithExpiry,
  clearSavedToken,
  clearGoogleConnection,
  exchangeAuthCode,
  getValidAccessToken,
  requestWritePermission as serviceRequestWritePermission,
} from "../services/googleAuthService";

// 再エクスポートして互換性を維持
export {
  REQUIRED_SCOPE,
  loadSavedToken,
  saveToken,
  saveTokenWithExpiry,
  clearSavedToken,
  getValidAccessToken,
  exchangeAuthCode,
};

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SCOPE = GOOGLE_OAUTH_SCOPES.join(" ");

export interface GoogleAuthState {
  accessToken: string | null;
  isSignedIn: boolean;
  isReady: boolean;
  signIn: () => void;
  signOut: () => void;
  requestAccessToken: (forcePrompt?: boolean) => Promise<string>;
  requestWritePermission: () => Promise<string>;
}

// ---------- フック ----------

/**
 * GIS Authorization Code Model (initCodeClient) + Cloud Functions 自動トークン更新による認証フック (Phase 2)。
 *
 * @param onLogin  新しいトークンが発行された時に呼び出されるコールバック。
 *                 useEffect の依存配列を経由せず、直接呼び出すことで
 *                 同期処理のトリガーをReactのレンダリングサイクルから切り離す。
 */
export function useGoogleAuth(
  onLogin?: (token: string) => void
): GoogleAuthState {
  const [accessToken, setAccessToken] = useState<string | null>(loadSavedToken);
  const [isReady, setIsReady] = useState(false);
  const codeClientRef = useRef<CodeClient | null>(null);
  const tokenClientRef = useRef<TokenClient | null>(null);
  const initializedRef = useRef(false);

  // 非同期アクセストークン要求待ちのリゾルバキュー
  const pendingResolversRef = useRef<
    { resolve: (token: string) => void; reject: (err: Error) => void }[]
  >([]);
  // GISポップアップ/トークン要求が現在進行中かどうかの排他ガードフラグ
  const isRequestingRef = useRef(false);

  // ref 経由でコールバックを常に最新に保つ（deps を不安定にしない）
  const onLoginRef = useRef(onLogin);
  useEffect(() => {
    onLoginRef.current = onLogin;
  });

  // 他コンポーネントや getValidAccessToken() / requestWritePermission() からのトークン変更イベントを購読
  useEffect(() => {
    const handleAuthChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ token: string | null }>;
      setAccessToken(customEvent.detail?.token ?? null);
    };
    window.addEventListener(GOOGLE_AUTH_CHANGED_EVENT, handleAuthChanged);
    return () =>
      window.removeEventListener(GOOGLE_AUTH_CHANGED_EVENT, handleAuthChanged);
  }, []);

  // マウント時に期限切れまたは残り5分未満であれば Cloud Functions 経由でバックグラウンド自動更新
  useEffect(() => {
    let mounted = true;
    const current = loadSavedToken();
    if (!current) {
      getValidAccessToken()
        .then((refreshed) => {
          if (mounted && refreshed) {
            setAccessToken(refreshed);
            onLoginRef.current?.(refreshed);
          }
        })
        .catch(() => {
          // バックグラウンド更新失敗時は無視
        });
    }
    return () => {
      mounted = false;
    };
  }, []);

  // ---------- CodeClient (オフラインアクセス要求) 初期化 ----------
  const initOAuthClient = useCallback(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (typeof google.accounts.oauth2.initCodeClient === "function") {
      codeClientRef.current = google.accounts.oauth2.initCodeClient({
        client_id: CLIENT_ID,
        scope: GOOGLE_OAUTH_SCOPES.join(" "),
        ux_mode: "popup",
        access_type: "offline",
        prompt: "consent",
        callback: async (resp: CodeResponse) => {
          isRequestingRef.current = false;
          if (resp.error || !resp.code) {
            console.error(
              "Google OAuth code error:",
              resp.error_description || resp.error
            );
            clearSavedToken();
            setAccessToken(null);
            const err = new Error(
              resp.error_description ||
                resp.error ||
                "Google認証に失敗しました。"
            );
            const resolvers = [...pendingResolversRef.current];
            pendingResolversRef.current = [];
            resolvers.forEach((r) => r.reject(err));
            return;
          }

          try {
            // 認可コードを Cloud Functions (/api/v1/auth/google/exchange) へ送信し、
            // リフレッシュトークンを Firestore に保存、accessToken と expiresAt を localStorage に保存
            const exchanged = await exchangeAuthCode(resp.code);
            setAccessToken(exchanged.accessToken);
            onLoginRef.current?.(exchanged.accessToken);

            const resolvers = [...pendingResolversRef.current];
            pendingResolversRef.current = [];
            resolvers.forEach((r) => r.resolve(exchanged.accessToken));
          } catch (exchangeErr) {
            console.error("Google OAuth code exchange failed:", exchangeErr);
            clearSavedToken();
            setAccessToken(null);
            const err =
              exchangeErr instanceof Error
                ? exchangeErr
                : new Error(String(exchangeErr));
            const resolvers = [...pendingResolversRef.current];
            pendingResolversRef.current = [];
            resolvers.forEach((r) => r.reject(err));
          }
        },
        error_callback: (err) => {
          isRequestingRef.current = false;
          console.error("Google OAuth error_callback:", err);
          clearSavedToken();
          setAccessToken(null);
          const error = new Error(
            err?.message || "Google認証がキャンセルされたか失敗しました。"
          );
          const resolvers = [...pendingResolversRef.current];
          pendingResolversRef.current = [];
          resolvers.forEach((r) => r.reject(error));
        },
      });
    } else if (typeof google.accounts.oauth2.initTokenClient === "function") {
      // テスト環境等で initTokenClient のみモックされている場合のフォールバック
      tokenClientRef.current = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (resp: TokenResponse) => {
          isRequestingRef.current = false;
          if (resp.error) {
            clearSavedToken();
            setAccessToken(null);
            const err = new Error(
              resp.error_description || resp.error || "Google認証に失敗しました。"
            );
            const resolvers = [...pendingResolversRef.current];
            pendingResolversRef.current = [];
            resolvers.forEach((r) => r.reject(err));
            return;
          }
          saveToken(resp.access_token, resp.expires_in, resp.scope);
          setAccessToken(resp.access_token);
          onLoginRef.current?.(resp.access_token);

          const resolvers = [...pendingResolversRef.current];
          pendingResolversRef.current = [];
          resolvers.forEach((r) => r.resolve(resp.access_token));
        },
        error_callback: (err) => {
          isRequestingRef.current = false;
          clearSavedToken();
          setAccessToken(null);
          const error = new Error(
            err?.message || "Google認証がキャンセルされたか失敗しました。"
          );
          const resolvers = [...pendingResolversRef.current];
          pendingResolversRef.current = [];
          resolvers.forEach((r) => r.reject(error));
        },
      });
    }

    setIsReady(true);
  }, []);

  // ---------- GIS スクリプト読み込み待機 ----------
  useEffect(() => {
    if (typeof google !== "undefined" && google.accounts) {
      initOAuthClient();
      return;
    }
    const handler = () => initOAuthClient();
    window.addEventListener("gsi-loaded", handler, { once: true });
    return () => window.removeEventListener("gsi-loaded", handler);
  }, [initOAuthClient]);

  // ---------- 非同期アクセストークン取得 (Promise) ----------
  const requestAccessToken = useCallback(
    async (forcePrompt = false): Promise<string> => {
      if (!forcePrompt) {
        // 1. まず getValidAccessToken() で有効トークン確認または Cloud Functions 自動更新を試行
        const validToken = await getValidAccessToken();
        if (validToken) {
          setAccessToken(validToken);
          return validToken;
        }
      } else {
        clearSavedToken();
        setAccessToken(null);
      }

      if (!codeClientRef.current && !tokenClientRef.current) {
        if (forcePrompt) {
          return serviceRequestWritePermission();
        }
        throw new Error(
          "Google認証クライアントの初期化中です。少々お待ちください。"
        );
      }

      // すでに認可コード要求ポップアップが進行中の場合、重複してポップアップを開かず
      // 進行中のリクエスト完了を待つPromiseキューに合流させる
      if (isRequestingRef.current) {
        return new Promise<string>((resolve, reject) => {
          pendingResolversRef.current.push({ resolve, reject });
        });
      }

      isRequestingRef.current = true;
      return new Promise<string>((resolve, reject) => {
        pendingResolversRef.current.push({ resolve, reject });
        try {
          if (codeClientRef.current) {
            codeClientRef.current.requestCode();
          } else {
            tokenClientRef.current?.requestAccessToken({
              prompt: forcePrompt ? "consent" : "",
            });
          }
        } catch (e) {
          isRequestingRef.current = false;
          pendingResolversRef.current = pendingResolversRef.current.filter(
            (r) => r.resolve !== resolve
          );
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    },
    []
  );

  // ---------- 書き込み権限・オフラインアクセスへの再同意・再認証 (prompt: "consent") ----------
  const requestWritePermission = useCallback((): Promise<string> => {
    return requestAccessToken(true);
  }, [requestAccessToken]);

  // ---------- ログイン / ログアウト ----------
  const signIn = useCallback(() => {
    requestAccessToken(true).catch((err) => {
      console.warn("Sign in cancelled or failed:", err);
    });
  }, [requestAccessToken]);

  const signOut = useCallback(() => {
    const cur = accessToken;
    clearGoogleConnection();
    setAccessToken(null);
    if (cur && typeof google !== "undefined" && google.accounts?.oauth2) {
      google.accounts.oauth2.revoke(cur, () => {});
    }
  }, [accessToken]);

  return {
    accessToken,
    isSignedIn: !!accessToken,
    isReady,
    signIn,
    signOut,
    requestAccessToken,
    requestWritePermission,
  };
}
