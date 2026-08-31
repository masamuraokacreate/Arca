/**
 * src/components/tasks/PMSkipReasonModal.tsx
 * Arca — PM スキップ理由入力シート（Apple HIG × Arca 準拠）
 *
 * 設計原則:
 *  - 枠線の完全排除・多層シャドウ・マットゴールド #C5A059
 *  - ボトムシート/モーダル風のスライドインアニメーション
 *  - クイック選択チップ（「時間不足」「体調優先」「次回サイクルへ繰越」「不要」）
 *  - 自由記述 textarea + 「スキップを記録」「キャンセル」
 */

import { useState, useEffect, useRef } from "react";
import { C } from "../../lib/designSystem";

export interface PMSkipReasonModalProps {
  isOpen?: boolean;
  taskTitle?: string;
  itemTitle?: string; // 互換用
  onClose?: () => void;
  onCancel?: () => void; // 互換用
  onConfirm: (reason: string) => void;
}

const QUICK_CHIPS = ["時間不足", "体調優先", "次回サイクルへ繰越", "不要"];

export function PMSkipReasonModal({
  isOpen = true,
  taskTitle,
  itemTitle,
  onClose,
  onCancel,
  onConfirm,
}: PMSkipReasonModalProps) {
  const title = taskTitle || itemTitle || "タスク";
  const handleClose = onClose || onCancel || (() => {});

  const [reason, setReason] = useState("");
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // マウント時にフォーカス
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Escape キーでキャンセル
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const handleChipClick = (chip: string) => {
    if (selectedChip === chip) {
      setSelectedChip(null);
      setReason("");
    } else {
      setSelectedChip(chip);
      setReason(chip);
    }
  };

  const handleConfirm = () => {
    onConfirm(reason.trim());
  };

  return (
    <div
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(44, 44, 46, 0.28)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 1100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        animation: "pm-overlay-in 0.2s ease",
      }}
    >
      {/* ── シート本体 ── */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "540px",
          background: "var(--bg-card-solid)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRadius: `${C.radiusCard} ${C.radiusCard} 0 0`,
          padding: "1.75rem 1.75rem 2.25rem",
          boxShadow: C.toastShadow,
          border: "1px solid var(--border-subtle)",
          animation: "pm-sheet-up 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
          boxSizing: "border-box",
        }}
      >
        {/* ハンドルバー */}
        <div
          style={{
            width: "36px",
            height: "4px",
            background: "rgba(0, 0, 0, 0.12)",
            borderRadius: "9999px",
            margin: "0 auto 1.25rem",
          }}
        />

        {/* タイトル */}
        <p
          style={{
            margin: "0 0 0.25rem",
            fontSize: "0.68rem",
            fontWeight: 650,
            color: C.charcoalLight,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          実施見送り（スキップ）の記録
        </p>
        <h3
          style={{
            margin: "0 0 1.2rem",
            fontSize: "1.05rem",
            fontWeight: 650,
            color: C.charcoal,
            letterSpacing: "-0.01em",
          }}
        >
          「{title}」をスキップ
        </h3>

        {/* クイック選択チップ */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
          {QUICK_CHIPS.map((chip) => {
            const isSelected = selectedChip === chip;
            return (
              <button
                key={chip}
                type="button"
                onClick={() => handleChipClick(chip)}
                style={{
                  background: isSelected ? C.goldFaint2 : "var(--bg-nav-track)",
                  color: isSelected ? C.goldDark : C.charcoalMid,
                  border: "none",
                  borderRadius: "9999px",
                  padding: "0.35rem 0.8rem",
                  fontSize: "0.78rem",
                  fontWeight: isSelected ? 600 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  boxShadow: isSelected ? `0 2px 8px ${C.goldFaint3}` : "none",
                }}
              >
                {chip}
              </button>
            );
          })}
        </div>

        {/* 自由記述テキストエリア */}
        <textarea
          ref={textareaRef}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (selectedChip && e.target.value !== selectedChip) {
              setSelectedChip(null);
            }
          }}
          placeholder="理由をメモ（省略可）"
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: C.white,
            border: "1px solid var(--border-subtle)",
            borderRadius: "14px",
            outline: "none",
            resize: "none",
            fontSize: "0.88rem",
            color: C.charcoal,
            lineHeight: 1.6,
            padding: "0.85rem 1rem",
            letterSpacing: "0.01em",
            fontFamily: "-apple-system, 'Hiragino Sans', sans-serif",
            marginBottom: "1.25rem",
          }}
        />

        {/* アクションボタン */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            onClick={handleClose}
            style={{
              flex: 1,
              background: "var(--bg-nav-track)",
              border: "1px solid var(--border-subtle)",
              borderRadius: C.radiusBtn,
              padding: "0.75rem",
              fontSize: "0.88rem",
              fontWeight: 500,
              color: C.charcoal,
              cursor: "pointer",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0, 0, 0, 0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0, 0, 0, 0.05)")}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              flex: 2,
              background: C.goldDark,
              border: "none",
              borderRadius: C.radiusBtn,
              padding: "0.75rem",
              fontSize: "0.88rem",
              fontWeight: 600,
              color: "#FDFCFA",
              cursor: "pointer",
              transition: "opacity 0.15s ease, transform 0.1s ease",
              boxShadow: "0 2px 10px rgba(168, 134, 61, 0.25)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.92")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            スキップを記録
          </button>
        </div>
      </div>

      {/* アニメーション定義 */}
      <style>{`
        @keyframes pm-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes pm-sheet-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
