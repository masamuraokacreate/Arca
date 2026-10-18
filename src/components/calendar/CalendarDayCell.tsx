/**
 * src/components/calendar/CalendarDayCell.tsx
 * Arca — カレンダー日付セルコンポーネント
 *
 * 設計原則:
 *  - 道具としての静けさ、Apple HIG × Arca 準拠
 *  - 日付数字、出勤/休日シフト情報（マイクロピル/アイコン）
 *  - 予定・タスク期限ドットインジケータ
 *  - PM周期保全の専用巡回インジケータ（控えめなSVGアイコン `RotateCw`）
 *  - インジケータ押下でPM実行ポップオーバーを展開
 *  - 絵文字完全排除（Lucide React SVGアイコンのみ使用）
 */

import React from "react";
import { Sun, Moon, RotateCw, Check } from "lucide-react";
import { C } from "../../lib/designSystem";
import type { PMMaster } from "../../types/pm";

export interface CalendarDayCellProps {
  dateStr: string;
  day: number;
  inMonth: boolean;
  isSun: boolean;
  isSat: boolean;
  isSelected: boolean;
  isToday: boolean;
  hasEvent: boolean;
  hasTask: boolean;
  /** PM周期保全の有無 */
  hasPM: boolean;
  /** 当日のPMマスタ一覧 */
  pmMasters?: PMMaster[];
  /** シフト情報 */
  shift?: { isWork: boolean; title?: string; startTime?: string };
  isRest: boolean;
  showShift: boolean;
  /** 日付選択ハンドラ */
  onSelectDate: (dateStr: string) => void;
  /** PM実行ポップオーバーを開くハンドラ */
  onOpenPMExecution?: (dateStr: string, masters: PMMaster[]) => void;
  /** PMオーバーライドポップオーバーを開くハンドラ */
  onOpenPMOverride?: (master: PMMaster, anchorRect: DOMRect) => void;
}

/** 出勤時間帯に応じたマイクロピルのスタイル */
export function getShiftTimeStyle(startTime?: string, isSelected?: boolean): {
  className: string;
  style: React.CSSProperties;
} {
  const baseClass = "text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0";

  if (isSelected) {
    return {
      className: `${baseClass} bg-white/25 text-white`,
      style: {
        letterSpacing: "-0.02em",
        lineHeight: 1.2,
      },
    };
  }

  if (!startTime || !/^\d{1,2}:\d{2}$/.test(startTime)) {
    // 標準日勤
    return {
      className: `${baseClass} bg-stone-500/10 text-stone-700 dark:text-stone-300`,
      style: {
        letterSpacing: "-0.02em",
        lineHeight: 1.2,
      },
    };
  }

  const [h] = startTime.split(":").map(Number);

  if (h >= 5 && h < 12) {
    // 早番（朝: 05:00〜11:59開始）: ソフトアンバー
    return {
      className: `${baseClass} bg-amber-500/10 text-amber-800 dark:text-amber-300`,
      style: {
        letterSpacing: "-0.02em",
        lineHeight: 1.2,
      },
    };
  } else if (h >= 15) {
    // 遅番（夜: 15:00以降開始）: トワイライトインディゴ
    return {
      className: `${baseClass} bg-indigo-500/10 text-indigo-800 dark:text-indigo-300`,
      style: {
        letterSpacing: "-0.02em",
        lineHeight: 1.2,
      },
    };
  } else {
    // 日勤（昼: 12:00〜14:59開始、または標準日勤）: ソフトオリーブ/サンドセージ
    return {
      className: `${baseClass} bg-stone-500/10 text-stone-700 dark:text-stone-300`,
      style: {
        letterSpacing: "-0.02em",
        lineHeight: 1.2,
      },
    };
  }
}

/** 日付数字のピルスタイリング（ダッシュボード4勤2休シフト連動） */
export function getDayNumberPillStyle({
  isSelected: _isSelected = false,
  isRest,
  isWork,
  inMonth,
  isSun,
  isSat,
  isToday,
}: {
  isSelected: boolean;
  isRest: boolean;
  isWork: boolean;
  inMonth: boolean;
  isSun: boolean;
  isSat: boolean;
  isToday: boolean;
}): { className: string; style: React.CSSProperties } {
  const baseClass =
    "inline-flex items-center justify-center min-w-[26px] px-2 py-0.5 rounded-full text-[0.8rem] font-semibold transition-all select-none leading-none";

  if (!inMonth) {
    return {
      className: `${baseClass} opacity-35 text-stone-400 dark:text-stone-600 bg-transparent`,
      style: {},
    };
  }

  // 休日（ライト: アイスブルー透過 / ダーク: スカイブルー透過）
  if (isRest || isSun) {
    return {
      className: `${baseClass} shift-badge-holiday`,
      style: {
        ...(isToday ? { outline: "2px solid var(--accent-gold, #C5A059)", outlineOffset: "1px" } : {}),
      },
    };
  }

  // 出勤日（控えめなスレート透過）
  if (isWork) {
    return {
      className: `${baseClass} shift-badge-work`,
      style: {
        ...(isToday ? { outline: "2px solid var(--accent-gold, #C5A059)", outlineOffset: "1px" } : {}),
      },
    };
  }

  // 通常日（土曜日など）/ フォールバック
  return {
    className: `${baseClass} ${
      isSat
        ? "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/30"
        : "shift-badge-work"
    }`,
    style: {
      ...(isToday ? { outline: "2px solid var(--accent-gold, #C5A059)", outlineOffset: "1px" } : {}),
    },
  };
}

export function CalendarDayCell({
  dateStr,
  day,
  inMonth,
  isSun,
  isSat,
  isSelected,
  isToday,
  hasEvent,
  hasTask,
  hasPM,
  pmMasters = [],
  shift,
  isRest,
  showShift,
  onSelectDate,
  onOpenPMExecution,
  onOpenPMOverride,
}: CalendarDayCellProps) {
  const isWork = Boolean(shift?.isWork);

  // 当日PMの完了判定（もしlastCompletedAtが今日であれば完了アイコンに変化）
  const isAllPMCompleted =
    hasPM &&
    pmMasters.length > 0 &&
    pmMasters.every((m) => m.lastCompletedAt && m.lastCompletedAt.slice(0, 10) === dateStr);

  const handlePMIndicatorClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenPMOverride && pmMasters.length > 0) {
      onOpenPMOverride(pmMasters[0], e.currentTarget.getBoundingClientRect());
    } else if (onOpenPMExecution) {
      onOpenPMExecution(dateStr, pmMasters);
    } else {
      onSelectDate(dateStr);
    }
  };

  const pillStyle = getDayNumberPillStyle({
    isSelected,
    isRest,
    isWork,
    inMonth,
    isSun,
    isSat,
    isToday,
  });

  return (
    <button
      type="button"
      onClick={() => onSelectDate(dateStr)}
      className={`calendar-cell ${
        isSelected ? "calendar-cell-selected" : isToday ? "calendar-cell-today" : ""
      }`}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: "54px",
        padding: "0.35rem 0.2rem 0.3rem",
        border: "none",
        borderRadius: "10px",
        cursor: "pointer",
        transition: "all 0.15s ease",
        outline: "none",
        userSelect: "none",
      }}
    >
      {/* 上部ヘッダー：日付数字（ピル表示） & PM専用巡回インジケータ */}
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <span
          className={pillStyle.className}
          style={pillStyle.style}
          data-testid={`day-pill-${dateStr}`}
        >
          {day}
        </span>

        {/* PM専用巡回インジケータ (SVGアイコン) */}
        {hasPM && (
          <div
            onClick={handlePMIndicatorClick}
            role="button"
            tabIndex={0}
            title={
              pmMasters.length > 0
                ? `PM周期保全: ${pmMasters.map((m) => m.title).join(", ")}`
                : "PM周期保全タスクあり"
            }
            data-testid={`pm-indicator-${dateStr}`}
            style={{
              position: "absolute",
              right: "-2px",
              top: "-2px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "18px",
              height: "18px",
              borderRadius: "50%",
              backgroundColor: isSelected
                ? "var(--accent-gold-faint3, rgba(197, 160, 89, 0.3))"
                : isAllPMCompleted
                ? "rgba(82, 121, 111, 0.15)"
                : "var(--accent-gold-faint2, rgba(197, 160, 89, 0.18))",
              color: isSelected
                ? "var(--accent-gold-dark, #B88E3E)"
                : isAllPMCompleted
                ? "#52796F"
                : "var(--accent-gold-dark, #B88E3E)",
              cursor: "pointer",
              transition: "transform 0.15s ease, background-color 0.15s ease",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.06)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {isAllPMCompleted ? (
              <Check size={11} strokeWidth={2.8} />
            ) : (
              <RotateCw size={10} strokeWidth={2.4} />
            )}
          </div>
        )}
      </div>

      {/* シフト時間マイクロピル または Sun/Moon インジケータ */}
      {inMonth && showShift && (
        <div
          style={{
            margin: "2px 0",
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isWork ? (
            shift?.startTime ? (
              <span
                className={getShiftTimeStyle(shift.startTime, false).className}
                style={getShiftTimeStyle(shift.startTime, false).style}
                data-testid="shift-time-pill"
              >
                {shift.startTime}
              </span>
            ) : (
              <Sun
                style={{
                  width: "0.75rem",
                  height: "0.75rem",
                  color: isSelected ? C.goldDark : C.goldDark,
                }}
                aria-label="出勤"
                data-testid="cell-work-sun-icon"
              />
            )
          ) : (
            <Moon
              style={{
                width: "0.72rem",
                height: "0.72rem",
                color: isSelected ? C.sage : C.sage,
                opacity: 0.85,
              }}
              aria-label="休日"
              data-testid="cell-holiday-moon-icon"
            />
          )}
        </div>
      )}

      {/* 下部ドットインジケータ（予定・タスクの補助ドット。PMドットは削除） */}
      <div style={{ display: "flex", gap: "2.5px", minHeight: "5px", alignItems: "center" }}>
        {hasEvent && (
          <span
            style={{
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              background: C.gold,
            }}
            title="予定あり"
          />
        )}
        {hasTask && (
          <span
            style={{
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              background: C.charcoalLight,
            }}
            title="タスク期限あり"
          />
        )}
      </div>
    </button>
  );
}
