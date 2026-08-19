/**
 * src/components/AuthGate.tsx
 * Arca — Firebase Authentication Google ログインゲート（ホワイトリスト厳格認証）
 *
 * 設計原則 (Core/Rules.md & Apple HIG):
 *  - 洗練されたミニマリズム、漆黒とアイボリー、多層シャドウ
 *  - 許可された管理者メールアドレスのみアクセスを厳格に許可
 *  - 未許可ユーザー（サブアカウント・他人）には即座に signOut し、Access Denied を通知
 */

import { useState, useEffect, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { C } from "../lib/designSystem";

// ─── 管理者メールアドレス定義（コード内ホワイトリスト配列 ＆ 環境変数） ───
export const DEFAULT_ALLOWED_EMAILS = [
  "masatomuraoka1028@gmail.com",
  "masatomuraoka.create@gmail.com",
];

const envAllowed = (import.meta.env.VITE_ALLOWED_EMAIL as string | undefined)
  ?.split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean) || [];

export const ALLOWED_EMAILS: string[] = Array.from(
  new Set([
    ...DEFAULT_ALLOWED_EMAILS.map((e) => e.trim().toLowerCase()),
    ...envAllowed,
  ])
);

/** メールアドレスがホワイトリストに適合するか厳格判定 */
export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const target = email.trim().toLowerCase();
  const allowed = ALLOWED_EMAILS.some((item) => item.trim().toLowerCase() === target);
  console.log("Login attempt:", email, "Allowed list:", ALLOWED_EMAILS, "Result:", allowed);
  return allowed;
}

/** Google ログインプロバイダ */
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

/** サインアウト関数（外部利用用） */
export async function logoutUser() {
  await signOut(auth);
}

// ─── Google G アイコン ───
function GoogleIcon() {
  return (
    <svg style={{ width: "18px", height: "18px", flexShrink: 0 }} viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      // ホワイトリスト厳格判定
      if (!isEmailAllowed(user.email)) {
        setErrorMsg(`このアカウント（${user.email || "未設定"}）にはアクセス権限がありません（Access Denied）。`);
        signOut(auth);
        setCurrentUser(null);
      } else {
        setErrorMsg(null);
        setCurrentUser(user);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setErrorMsg(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (!isEmailAllowed(result?.user?.email)) {
        setErrorMsg(`このアカウント（${result?.user?.email || "未設定"}）にはアクセス権限がありません（Access Denied）。`);
        await signOut(auth);
        setCurrentUser(null);
      }
    } catch (err: unknown) {
      console.error("Sign in failed:", err);
      const e = err as { code?: string; message?: string };
      if (e.code !== "auth/popup-closed-by-user") {
        setErrorMsg("ログイン中にエラーが発生しました。もう一度お試しください。");
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // ─── 認証チェック中（Apple風ローディング表示） ───
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: C.bgApp,
        }}
      >
        <img
          src="/Arca_logo.png"
          alt="Arca"
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "14px",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08)",
            animation: "arca-pulse 1.8s ease-in-out infinite",
          }}
        />
      </div>
    );
  }

  // ─── 認証済み ＆ 許可ユーザー ───
  if (currentUser) {
    return <>{children}</>;
  }

  // ─── 未認証 / 未許可 ログイン画面 ───
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse at 50% 30%, #FAF8F5 0%, #EDE9E3 100%)",
        padding: "calc(1.5rem + env(safe-area-inset-top, 0px)) calc(1.5rem + env(safe-area-inset-right, 0px)) calc(1.5rem + env(safe-area-inset-bottom, 0px)) calc(1.5rem + env(safe-area-inset-left, 0px))",
        boxSizing: "border-box",
      }}
    >
      <div
        className="arca-card"
        style={{
          width: "100%",
          maxWidth: "380px",
          padding: "2.8rem 2.2rem 2.4rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          borderRadius: "28px",
          boxShadow: "0 20px 40px -12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)",
          animation: "arca-module-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* ロゴ */}
        <div style={{ marginBottom: "1.5rem", position: "relative" }}>
          <img
            src="/Arca_logo.png"
            alt="Arca"
            style={{
              width: "76px",
              height: "76px",
              borderRadius: "18px",
              boxShadow: "0 10px 25px -4px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04)",
            }}
          />
        </div>

        {/* ブランド名・説明 */}
        <h1
          style={{
            fontSize: "1.65rem",
            fontWeight: 750,
            letterSpacing: "0.14em",
            color: C.charcoal,
            margin: "0 0 0.4rem",
          }}
        >
          Arca
        </h1>
        <p
          style={{
            fontSize: "0.78rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: C.charcoalLight,
            margin: "0 0 2.2rem",
            fontWeight: 500,
          }}
        >
          Personal Operating System
        </p>

        {/* エラーメッセージ（未許可アクセスなど） */}
        {errorMsg && (
          <div
            style={{
              marginBottom: "1.5rem",
              padding: "0.75rem 1rem",
              borderRadius: "12px",
              background: "rgba(224, 86, 74, 0.08)",
              color: C.danger,
              fontSize: "0.78rem",
              lineHeight: 1.45,
              width: "100%",
              boxSizing: "border-box",
              fontWeight: 500,
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Google ログインボタン */}
        <button
          onClick={handleSignIn}
          disabled={isSigningIn}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            background: C.white,
            color: C.charcoal,
            border: "none",
            borderRadius: "14px",
            padding: "0.85rem 1.2rem",
            fontSize: "0.88rem",
            fontWeight: 600,
            letterSpacing: "0.01em",
            cursor: isSigningIn ? "default" : "pointer",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)",
            transition: "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
            userSelect: "none",
          }}
          onMouseEnter={(e) => {
            if (!isSigningIn) {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                "0 6px 16px rgba(0, 0, 0, 0.09), 0 2px 4px rgba(0, 0, 0, 0.04)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isSigningIn) {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                "0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)";
            }
          }}
        >
          <GoogleIcon />
          <span>{isSigningIn ? "認証中…" : "Googleアカウントで続ける"}</span>
        </button>

        {/* フッタープライバシー注記記号 */}
        <p
          style={{
            marginTop: "1.8rem",
            fontSize: "0.68rem",
            color: C.charcoalXLight,
            letterSpacing: "0.02em",
            margin: "1.8rem 0 0",
          }}
        >
          プライベートアクセス保護
        </p>
      </div>
    </div>
  );
}
