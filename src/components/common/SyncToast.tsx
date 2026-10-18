/**
 * src/components/common/SyncToast.tsx
 * Google Calendar API 通信エラー・同期失敗を通知する控えめなトーストUI
 *
 * UI/UX・スタイリング仕様:
 *  - 超淡色プリズム・ホワイト仕様および Apple HIG に準拠
 *  - 画面右下に配置
 *  - 背景: rgba(255, 255, 255, 0.7), backdrop-filter: blur(20px)
 *  - ボーダー: 1px solid rgba(255, 255, 255, 0.5)
 *  - テキスト色: #334155 (Deep Slate)
 *  - 再認証ボタン: プリズムグラデーション背景、文字色 #334155
 *  - ポップアップブロック回避のため、再認証ボタンの onClick から直接 requestWritePermission() を呼び出す
 */

import { AlertCircle, X, KeyRound } from "lucide-react";
import type { SyncErrorState } from "../../types";
import { requestWritePermission } from "../../services/googleAuthService";

export type { SyncErrorState };

export interface SyncToastProps {
  /** エラー状態（hasError === false の場合は非表示） */
  errorState: SyncErrorState;
  /** 再認証ボタン押下時のカスタムハンドラ（省略時は requestWritePermission() を直接呼び出す） */
  onReauth?: () => Promise<unknown> | void;
  /** トーストを閉じるハンドラ */
  onDismiss?: () => void;
}

export function SyncToast({ errorState, onReauth, onDismiss }: SyncToastProps) {
  if (!errorState.hasError || !errorState.message) {
    return null;
  }

  // ポップアップブロック回避のため、必ずボタンの onClick イベント内で直接認証関数を起動する
  const handleReauthClick = async () => {
    try {
      if (onReauth) {
        await onReauth();
      } else {
        await requestWritePermission();
      }
      onDismiss?.();
    } catch (err) {
      console.warn("[SyncToast] Re-authentication cancelled or failed:", err);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="sync-toast"
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        zIndex: 1300,
        maxWidth: "min(420px, calc(100vw - 2rem))",
        background: "rgba(255, 255, 255, 0.7)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.5)",
        borderRadius: "16px",
        boxShadow:
          "0 12px 32px -4px rgba(15, 23, 42, 0.08), 0 4px 12px -2px rgba(15, 23, 42, 0.04)",
        padding: "0.85rem 1.05rem",
        color: "#334155",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        animation: "arca-module-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <AlertCircle
        size={17}
        style={{
          color: "#334155",
          flexShrink: 0,
          opacity: 0.85,
        }}
      />

      <span
        data-testid="sync-toast-message"
        style={{
          flex: 1,
          fontSize: "0.8rem",
          fontWeight: 600,
          color: "#334155",
          lineHeight: 1.45,
          letterSpacing: "0.01em",
        }}
      >
        {errorState.message}
      </span>

      {errorState.requireReauth && (
        <button
          type="button"
          onClick={handleReauthClick}
          data-testid="sync-toast-reauth-btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            background:
              "linear-gradient(135deg, rgba(138, 194, 221, 0.15) 0%, rgba(165, 243, 252, 0.1) 35%, rgba(224, 231, 255, 0.15) 70%, rgba(252, 231, 243, 0.1) 100%)",
            color: "#334155",
            border: "1px solid rgba(255, 255, 255, 0.65)",
            borderRadius: "10px",
            padding: "0.38rem 0.72rem",
            fontSize: "0.75rem",
            fontWeight: 700,
            letterSpacing: "0.02em",
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.05)",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
          }}
        >
          <KeyRound size={13} />
          <span>再認証</span>
        </button>
      )}

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="通知を閉じる"
          data-testid="sync-toast-dismiss-btn"
          style={{
            background: "transparent",
            border: "none",
            padding: "0.2rem",
            cursor: "pointer",
            color: "#334155",
            opacity: 0.6,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "6px",
            flexShrink: 0,
          }}
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

export default SyncToast;
