/**
 * src/components/notes/ConfirmModal.tsx
 * Arca — Apple HIG 準拠の破壊的アクション確認モーダル (Destructive Action Confirmation)
 *
 * 設計原則:
 * - 誤操作による意図しないデータ削除を確実に防ぐ
 * - 破壊的ボタンは赤色（C.danger）で明確に識別
 * - ESCキー・外側クリック・キャンセルボタンで安全にDismiss
 */

import { useEffect, useRef } from "react";
import { C } from "../../lib/designSystem";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "削除",
  cancelLabel = "キャンセル",
  isDestructive = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        background: "rgba(44, 44, 46, 0.28)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        ref={modalRef}
        className="arca-view-in"
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "rgba(253, 252, 250, 0.96)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          borderRadius: "20px",
          boxShadow: C.toastShadow,
          padding: "1.6rem 1.6rem 1.3rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.2rem",
          border: "1px solid rgba(255, 255, 255, 0.7)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <h3
            id="confirm-modal-title"
            style={{
              fontSize: "1.1rem",
              fontWeight: 700,
              color: C.charcoal,
              margin: 0,
              letterSpacing: "-0.015em",
            }}
          >
            {title}
          </h3>
          <p
            style={{
              fontSize: "0.83rem",
              color: C.charcoalMid,
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            {message}
          </p>
        </div>

        {/* ボタン群 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.6rem",
            marginTop: "0.4rem",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "0.55rem 1.1rem",
              borderRadius: "10px",
              background: "rgba(0, 0, 0, 0.05)",
              border: "none",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: 500,
              color: C.charcoalMid,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0, 0, 0, 0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0, 0, 0, 0.05)";
            }}
          >
            {cancelLabel}
          </button>

          <button
            onClick={onConfirm}
            style={{
              padding: "0.55rem 1.25rem",
              borderRadius: "10px",
              background: isDestructive ? C.danger : C.gold,
              color: C.white,
              border: "none",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: 650,
              boxShadow: isDestructive
                ? "0 2px 10px rgba(192, 97, 74, 0.3)"
                : "0 2px 10px rgba(197, 160, 89, 0.3)",
              transition: "transform 0.15s, opacity 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = "0.9";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = "1";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
