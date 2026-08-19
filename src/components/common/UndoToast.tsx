/**
 * src/components/common/UndoToast.tsx
 * Arca — Apple HIG 準拠の共通 Undo（元に戻す）トースト通知
 */

import { C } from "../../lib/designSystem";

export interface UndoToastState<T = unknown> {
  visible: boolean;
  leaving: boolean;
  message: string;
  item: T | null;
  remaining: number;
}

export function UndoToast<T>({
  toast,
  onUndo,
  onDismiss,
}: {
  toast: UndoToastState<T>;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  if (!toast.visible && !toast.leaving) return null;

  return (
    <div
      className={`arca-toast${toast.leaving ? " leaving" : ""}`}
      style={{
        position: "fixed",
        bottom: "2rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        background: "rgba(44, 44, 46, 0.92)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        color: "#FDFCFA",
        borderRadius: "9999px",
        padding: "0.65rem 1.25rem",
        display: "flex",
        alignItems: "center",
        gap: "0.85rem",
        boxShadow: C.toastShadow,
        minWidth: "280px",
        maxWidth: "92vw",
        pointerEvents: "all",
        boxSizing: "border-box",
        userSelect: "none",
      }}
    >
      {/* メッセージ */}
      <span
        style={{
          fontSize: "0.825rem",
          fontWeight: 450,
          lineHeight: 1.3,
          flex: 1,
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {toast.message}
      </span>

      {/* 残り時間インジケーター */}
      <div
        style={{
          width: "22px",
          height: "22px",
          borderRadius: "50%",
          background: "rgba(255, 255, 255, 0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.68rem",
          fontWeight: 600,
          color: "rgba(255, 255, 255, 0.65)",
          flexShrink: 0,
          fontFamily: "-apple-system, monospace",
        }}
      >
        {toast.remaining}
      </div>

      {/* 元に戻すボタン */}
      <button
        onClick={onUndo}
        style={{
          background: C.goldFaint3,
          border: "none",
          borderRadius: "9999px",
          padding: "0.32rem 0.85rem",
          cursor: "pointer",
          color: C.gold,
          fontSize: "0.78rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
          flexShrink: 0,
          whiteSpace: "nowrap",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(197, 160, 89, 0.36)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = C.goldFaint3;
        }}
      >
        元に戻す
      </button>

      {/* 閉じるボタン */}
      <button
        onClick={onDismiss}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "rgba(255, 255, 255, 0.4)",
          fontSize: "0.85rem",
          padding: "0.15rem",
          lineHeight: 1,
          transition: "color 0.15s",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255, 255, 255, 0.85)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255, 255, 255, 0.4)";
        }}
        title="閉じる"
      >
        ✕
      </button>
    </div>
  );
}
