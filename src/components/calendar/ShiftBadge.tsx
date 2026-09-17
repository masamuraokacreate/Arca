/**
 * src/components/calendar/ShiftBadge.tsx
 * Arca — 勤務ステータスバッジ（Apple HIG × Arca 準拠）
 *
 * 目的:
 *  - 「✦ 出勤 ◯日目」「🌙 休日 ◯日目」を直感的かつ美しく可視化
 *  - タップ/クリックで ShiftOverrideModal を開くトリガー
 *  - 枠線完全排除、マットゴールド / セージグリーン、多層シャドウ
 */

import React from "react";
import { Sun, Moon } from "lucide-react";
import type { ShiftInfo } from "../../types/shift";

export interface ShiftBadgeProps {
  shift: ShiftInfo;
  onClick?: () => void;
  testId?: string;
  className?: string;
  style?: React.CSSProperties;
  size?: "sm" | "md";
}

export function MoonIcon({ size = "0.82rem", style }: { size?: string | number; style?: React.CSSProperties }) {
  return (
    <Moon
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-block",
        verticalAlign: "middle",
        ...style,
      }}
      aria-label="moon"
    />
  );
}

export function SunIcon({ size = "0.82rem", style }: { size?: string | number; style?: React.CSSProperties }) {
  return (
    <Sun
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-block",
        verticalAlign: "middle",
        ...style,
      }}
      aria-label="sun"
    />
  );
}

export function ShiftBadge({
  shift,
  onClick,
  testId = "shift-badge",
  className,
  style,
  size = "md",
}: ShiftBadgeProps) {
  const isWork = shift.type === "work";
  const streakText = isWork
    ? `出勤 ${shift.streakNumber}日目`
    : `休日 ${shift.streakNumber}日目`;
  const shiftNameText = isWork && shift.shiftName ? ` (${shift.shiftName})` : "";
  const displayText = `${streakText}${shiftNameText}`;

  const isSmall = size === "sm";

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      title={shift.isOverridden ? "手動設定中（クリックで変更・自動判定に戻す）" : "Googleカレンダー連動中（クリックで手動調整）"}
      className={`inline-flex items-center border-none font-semibold tracking-[0.02em] select-none ${
        isWork
          ? "bg-amber-500/10 text-amber-800 dark:bg-amber-400/25 dark:text-amber-200"
          : "bg-teal-500/10 text-teal-800 dark:bg-teal-400/25 dark:text-teal-200"
      } ${className || ""}`}
      style={{
        gap: isSmall ? "0.3rem" : "0.4rem",
        padding: isSmall ? "0.2rem 0.6rem" : "0.3rem 0.8rem",
        borderRadius: "9999px",
        fontSize: isSmall ? "0.72rem" : "0.8rem",
        cursor: onClick ? "pointer" : "default",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
        transition: "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 3px 8px rgba(0, 0, 0, 0.08)";
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.04)";
        }
      }}
    >
      <span style={{ fontSize: isSmall ? "0.7rem" : "0.8rem", lineHeight: 1, display: "inline-flex", alignItems: "center" }}>
        {isWork ? <SunIcon size={isSmall ? "0.72rem" : "0.82rem"} /> : <MoonIcon size={isSmall ? "0.72rem" : "0.82rem"} />}
      </span>
      <span>{displayText}</span>
      {shift.isOverridden && (
        <span
          style={{
            fontSize: "0.62rem",
            padding: "0.05rem 0.35rem",
            borderRadius: "4px",
            background: isWork ? "rgba(197, 160, 89, 0.25)" : "rgba(82, 121, 111, 0.2)",
            marginLeft: "0.15rem",
            fontWeight: 500,
          }}
        >
          手動
        </span>
      )}
    </button>
  );
}

export default ShiftBadge;
