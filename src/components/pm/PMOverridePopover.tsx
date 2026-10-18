/**
 * src/components/pm/PMOverridePopover.tsx
 * Arca — PM カレンダー個別日程オーバーライド & 予定プレビュー ポップオーバー
 *
 * 設計原則:
 *  - 道具としての静けさ、Apple HIG × Arca 準拠（すりガラス効果、多層シャドウ、淡いボーダー）
 *  - カレンダーのPMバッジから起動し、次回予定日を個別オーバーライド
 *  - selectedDate 起算で calculateFuturePMSchedules をリアルタイム実行し、次回・次々回予定日（4勤2休シフト付き）をプレビュー
 *  - 過去日付や無効日付の検証・警告と更新ボタン制御
 *  - 絵文字完全排除、Lucide React SVG アイコンのみ使用
 */

import React, { useState, useEffect, useMemo } from "react";
import { Calendar, RotateCw, AlertCircle, X, Check } from "lucide-react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { C } from "../../lib/designSystem";
import type { PMMaster, PMSchedulePreview, PMSettings } from "../../types/pm";
import type { CalendarEvent } from "../../types";
import {
  calculateFuturePMSchedules,
  todayStr,
} from "../../services/pmMasterService";
import { useModalAnimation } from "../../hooks/useModalAnimation";

export interface PMOverridePopoverProps {
  isOpen: boolean;
  master: PMMaster | null;
  anchorRect?: DOMRect | null;
  currentDate?: string;
  events?: CalendarEvent[];
  settings?: PMSettings | null;
  onClose: () => void;
  onSaved?: (newDate: string) => void;
}

/** 周期設定のラベル生成ヘルパー */
function formatCycleLabel(master: PMMaster): string {
  switch (master.cycleType) {
    case "shift_cycle": {
      const catLabel =
        master.timingCategory === "holiday"
          ? "休日"
          : master.timingCategory === "early_shift"
          ? "早番"
          : master.timingCategory === "late_shift"
          ? "遅番"
          : "出勤";
      const day = master.timingDay || 1;
      const interval =
        master.cycleInterval && master.cycleInterval > 1
          ? `${master.cycleInterval}サイクルに1回`
          : "毎サイクル";
      return `${catLabel}${day}日目 (${interval})`;
    }
    case "monthly_day":
      return `毎月 ${master.cycleValue}日`;
    case "interval_month":
      return `${master.cycleValue}ヶ月ごと`;
    case "annual":
      return `年1回 (${master.cycleValue})`;
    case "interval_days":
    default:
      return `${master.cycleValue}日ごと`;
  }
}

export const PMOverridePopover: React.FC<PMOverridePopoverProps> = ({
  isOpen,
  master,
  anchorRect,
  currentDate,
  events = [],
  settings,
  onClose,
  onSaved,
}) => {
  const { shouldRender, isClosing, handleClose } = useModalAnimation({
    isOpen,
    onClose,
  });

  const today = todayStr();
  const initialDate = currentDate || master?.nextScheduledDate || today;

  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // マスタや日付の初期化
  useEffect(() => {
    if (isOpen && master) {
      const d = currentDate || master.nextScheduledDate || today;
      setSelectedDate(d);
      setErrorMessage(null);
      setSaving(false);
    }
  }, [isOpen, master, currentDate, today]);

  // 過去日付判定
  const isPastDate = useMemo(() => {
    if (!selectedDate) return false;
    return selectedDate < today;
  }, [selectedDate, today]);

  const isValidDate = useMemo(() => {
    return Boolean(selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate));
  }, [selectedDate]);

  // リアルタイム次回・次々回予定プレビュー算出
  const preview = useMemo<PMSchedulePreview | null>(() => {
    if (!master || !isValidDate) return null;
    return calculateFuturePMSchedules(
      selectedDate,
      {
        cycleType: master.cycleType,
        cycleValue: master.cycleValue,
        calcBasis: master.calcBasis,
        timingCategory: master.timingCategory,
        timingDay: master.timingDay,
        cycleInterval: master.cycleInterval,
        cycleIntervalOffset: master.cycleIntervalOffset,
      },
      events,
      settings
    );
  }, [master, selectedDate, isValidDate, events, settings]);

  // Escapeキーで閉じる
  useEffect(() => {
    if (!shouldRender || isClosing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shouldRender, isClosing, handleClose]);

  // ポップオーバー位置の算出
  const popoverStyle = useMemo<React.CSSProperties>(() => {
    if (!anchorRect) {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 1000,
      };
    }

    const popoverWidth = 320;
    const popoverHeight = 360;
    const padding = 12;

    let left = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;
    let top = anchorRect.bottom + 8;

    // 画面右端・左端の調整
    if (left + popoverWidth > window.innerWidth - padding) {
      left = window.innerWidth - popoverWidth - padding;
    }
    if (left < padding) {
      left = padding;
    }

    // 画面下端を超える場合は上部に表示
    if (top + popoverHeight > window.innerHeight - padding) {
      top = Math.max(padding, anchorRect.top - popoverHeight - 8);
    }

    return {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      zIndex: 1000,
    };
  }, [anchorRect]);

  // 保存処理
  const handleSave = async () => {
    if (!master || !isValidDate || isPastDate || saving) return;

    setSaving(true);
    setErrorMessage(null);
    try {
      const now = new Date().toISOString();
      await setDoc(
        doc(db, "pm_masters", master.id),
        {
          nextScheduledDate: selectedDate,
          updatedAt: now,
        },
        { merge: true }
      );

      if (onSaved) {
        onSaved(selectedDate);
      }
      handleClose();
    } catch (err) {
      console.error("[PMOverridePopover] Failed to update nextScheduledDate:", err);
      setErrorMessage("更新に失敗しました。ネットワーク状況を確認してください。");
      setSaving(false);
    }
  };

  if (!shouldRender || !master) return null;

  return (
    <>
      {/* 外部クリック用背景バックドロップ */}
      <div
        data-testid="pm-override-backdrop"
        onClick={handleClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 999,
          backgroundColor: "rgba(0, 0, 0, 0.18)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          opacity: isClosing ? 0 : 1,
          transition: "opacity 0.18s ease-out",
        }}
      />

      {/* ポップオーバー本体 */}
      <div
        data-testid="pm-override-popover"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...popoverStyle,
          width: "320px",
          maxWidth: "calc(100vw - 24px)",
          backgroundColor: "var(--bg-surface-glass, rgba(255, 255, 255, 0.88))",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: "18px",
          border: "1px solid rgba(0, 0, 0, 0.08)",
          boxShadow:
            "0 12px 32px -4px rgba(0, 0, 0, 0.14), 0 4px 12px rgba(0, 0, 0, 0.06)",
          padding: "1rem 1.1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.85rem",
          color: "var(--text-main, #2D312E)",
          opacity: isClosing ? 0 : 1,
          transform: isClosing
            ? anchorRect
              ? "scale(0.96)"
              : "translate(-50%, -48%) scale(0.96)"
            : anchorRect
            ? "scale(1)"
            : "translate(-50%, -50%) scale(1)",
          transition: "opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* ヘッダー: タイトル & 閉じるボタン */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
              <RotateCw size={13} strokeWidth={2.4} style={{ color: C.goldDark }} />
              <span style={{ fontSize: "0.7rem", fontWeight: 700, color: C.goldDark, letterSpacing: "0.02em" }}>
                PM日程オーバーライド
              </span>
            </div>
            <h3
              style={{
                margin: 0,
                fontSize: "0.95rem",
                fontWeight: 700,
                color: "var(--text-main)",
                lineHeight: 1.3,
              }}
            >
              {master.title}
            </h3>
            <span
              style={{
                fontSize: "0.72rem",
                color: C.charcoalLight,
                display: "inline-block",
                marginTop: "0.2rem",
              }}
            >
              設定周期: {formatCycleLabel(master)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="閉じる"
            style={{
              background: "transparent",
              border: "none",
              color: C.charcoalLight,
              cursor: "pointer",
              padding: "0.2rem",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.15s ease",
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* 日付選択ピッカー */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <label
            htmlFor="pm-override-date-input"
            style={{ fontSize: "0.72rem", fontWeight: 650, color: C.charcoalMid }}
          >
            新しい今回予定日
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "var(--bg-card-solid, #F9F8F6)",
              borderRadius: "10px",
              padding: "0.45rem 0.65rem",
              border: isPastDate ? `1px solid ${C.danger}` : "1px solid rgba(0, 0, 0, 0.06)",
            }}
          >
            <Calendar size={14} style={{ color: isPastDate ? C.danger : C.goldDark, flexShrink: 0 }} />
            <input
              id="pm-override-date-input"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: "0.82rem",
                fontWeight: 600,
                color: "var(--text-main)",
                width: "100%",
              }}
            />
          </div>
          {isPastDate && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                color: C.danger,
                fontSize: "0.68rem",
                marginTop: "0.15rem",
              }}
            >
              <AlertCircle size={11} />
              <span>過去の日付は指定できません</span>
            </div>
          )}
        </div>

        {/* プレビュー領域（構造化リスト: 最終実施日 → 今回 → 次回） */}
        <div
          data-testid="pm-schedule-preview"
          style={{
            background: "rgba(197, 160, 89, 0.06)",
            borderRadius: "12px",
            padding: "0.65rem 0.8rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.45rem",
            border: "1px solid rgba(197, 160, 89, 0.15)",
          }}
        >
          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: C.goldDark, letterSpacing: "0.02em" }}>
            連動予定プレビュー
          </div>

          {preview ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.74rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.charcoalMid }}>最終実施日:</span>
                <span style={{ color: C.charcoalMid }}>
                  {master.lastCompletedAt ? master.lastCompletedAt.slice(0, 10) : "未実施"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.charcoalMid }}>今回:</span>
                <span style={{ fontWeight: 700, color: "var(--text-main)" }}>
                  {preview.nextDate} <strong style={{ color: C.goldDark }}>({preview.nextShiftLabel})</strong>
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.charcoalMid }}>次回:</span>
                <span style={{ fontWeight: 600, color: "var(--text-main)" }}>
                  {preview.afterNextDate} <strong style={{ color: C.sage }}>({preview.afterNextShiftLabel})</strong>
                </span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: "0.72rem", color: C.charcoalLight }}>
              日付を選択すると今回・次回の予定日が計算されます
            </div>
          )}
        </div>

        {/* エラーメッセージ */}
        {errorMessage && (
          <div
            style={{
              padding: "0.45rem 0.6rem",
              borderRadius: "8px",
              backgroundColor: "rgba(224, 86, 36, 0.08)",
              color: C.danger,
              fontSize: "0.7rem",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <AlertCircle size={12} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* アクションボタン */}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.2rem" }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: "0.5rem 0.8rem",
              borderRadius: "10px",
              border: "none",
              background: "var(--bg-card-solid, #F0ECE1)",
              color: C.charcoalMid,
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              transition: "opacity 0.15s ease",
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPastDate || !isValidDate || saving}
            style={{
              flex: 1.3,
              padding: "0.5rem 0.8rem",
              borderRadius: "10px",
              border: "none",
              background: isPastDate || !isValidDate || saving ? C.charcoalLight : C.gold,
              color: "#FFFFFF",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: isPastDate || !isValidDate || saving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.35rem",
              boxShadow: isPastDate || !isValidDate || saving ? "none" : "0 2px 6px rgba(197, 160, 89, 0.35)",
              transition: "all 0.15s ease",
            }}
          >
            {saving ? (
              <span>更新中...</span>
            ) : (
              <>
                <Check size={13} strokeWidth={2.5} />
                <span>更新する</span>
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
};

export default PMOverridePopover;
