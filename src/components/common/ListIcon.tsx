/**
 * src/components/common/ListIcon.tsx
 * タスクグループ（リスト）用 12種類の洗練された SVG アイコン & アイコン選択ピッカー
 *
 * デザイン原則:
 * - Apple HIG / Lucide デザイン言語に準拠したミニマルなストロークアイコン
 * - 安直なテキスト絵文字（📚や🧺）を排し、均一な線幅 (strokeWidth 1.9) で設計
 * - 各リストに合わせた自由なアイコン選択と切り替えをサポート
 */

import React from "react";
import { C } from "../../lib/designSystem";

export type ListIconId =
  | "sparkle"
  | "cart"
  | "check-circle"
  | "briefcase"
  | "book-open"
  | "heart"
  | "flame"
  | "folder"
  | "flag"
  | "tag"
  | "home"
  | "lightbulb";

export interface ListIconMeta {
  id: ListIconId;
  label: string;
}

export const LIST_ICONS: ListIconMeta[] = [
  { id: "sparkle", label: "星・ひらめき" },
  { id: "cart", label: "カート・買い物" },
  { id: "check-circle", label: "チェック・ToDo" },
  { id: "briefcase", label: "ビジネス・仕事" },
  { id: "book-open", label: "本・学習" },
  { id: "heart", label: "ハート・健康" },
  { id: "flame", label: "炎・重要" },
  { id: "folder", label: "フォルダ・案件" },
  { id: "flag", label: "旗・目標" },
  { id: "tag", label: "タグ・分類" },
  { id: "home", label: "ホーム・生活" },
  { id: "lightbulb", label: "電球・アイデア" },
];

export interface ListIconProps {
  icon?: string | null;
  size?: string | number;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * リストアイコン SVG レンダラー
 */
export function ListIcon({
  icon,
  size = "0.95rem",
  style,
  className,
}: ListIconProps) {
  const iconId = (icon as ListIconId) || "sparkle";

  const baseSvgProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: {
      width: size,
      height: size,
      flexShrink: 0,
      display: "inline-block",
      verticalAlign: "middle",
      ...style,
    },
    className,
  };

  switch (iconId) {
    case "sparkle":
      return (
        <svg {...baseSvgProps} aria-label="sparkle">
          <path d="M12 3c.5 4 3 6.5 7 7-4 .5-6.5 3-7 7-.5-4-3-6.5-7-7 4-.5 6.5-3 7-7z" />
        </svg>
      );

    case "cart":
      return (
        <svg {...baseSvgProps} aria-label="cart">
          <circle cx="8" cy="21" r="1.2" />
          <circle cx="19" cy="21" r="1.2" />
          <path d="M2.5 2.5h2.5l2.4 11.5a1.8 1.8 0 0 0 1.8 1.5h9.4a1.8 1.8 0 0 0 1.8-1.4l1.6-7.1H5.7" />
        </svg>
      );

    case "check-circle":
      return (
        <svg {...baseSvgProps} aria-label="check-circle">
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12 2.5 2.5 4.5-4.5" />
        </svg>
      );

    case "briefcase":
      return (
        <svg {...baseSvgProps} aria-label="briefcase">
          <rect width="18" height="13" x="3" y="7" rx="2" />
          <path d="M15 20V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v15" />
        </svg>
      );

    case "book-open":
      return (
        <svg {...baseSvgProps} aria-label="book-open">
          <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2H11v18H4.5A2.5 2.5 0 0 0 2 22.5Z" />
          <path d="M22 4.5A2.5 2.5 0 0 0 19.5 2H13v18h6.5a2.5 2.5 0 0 1 2.5 2.5Z" />
        </svg>
      );

    case "heart":
      return (
        <svg {...baseSvgProps} aria-label="heart">
          <path d="M19 14c1.5-1.5 2.5-3.2 2.5-5.3A5.2 5.2 0 0 0 16.2 3.5c-1.8 0-3 .5-4.2 2-1.2-1.5-2.4-2-4.2-2A5.2 5.2 0 0 0 2.5 8.7c0 2.1 1 3.8 2.5 5.3L12 21.2Z" />
        </svg>
      );

    case "flame":
      return (
        <svg {...baseSvgProps} aria-label="flame">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      );

    case "folder":
      return (
        <svg {...baseSvgProps} aria-label="folder">
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
      );

    case "flag":
      return (
        <svg {...baseSvgProps} aria-label="flag">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" x2="4" y1="22" y2="15" />
        </svg>
      );

    case "tag":
      return (
        <svg {...baseSvgProps} aria-label="tag">
          <path d="M12 2H3v9l9 9a2.5 2.5 0 0 0 3.5 0l5.5-5.5a2.5 2.5 0 0 0 0-3.5L12 2Z" />
          <circle cx="7" cy="6" r="1" />
        </svg>
      );

    case "home":
      return (
        <svg {...baseSvgProps} aria-label="home">
          <path d="m3 9.5 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 21.5 9 12.5 15 12.5 15 21.5" />
        </svg>
      );

    case "lightbulb":
      return (
        <svg {...baseSvgProps} aria-label="lightbulb">
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
          <path d="M9 18h6" />
          <path d="M10 21h4" />
        </svg>
      );

    default:
      return (
        <svg {...baseSvgProps} aria-label="sparkle">
          <path d="M12 3c.5 4 3 6.5 7 7-4 .5-6.5 3-7 7-.5-4-3-6.5-7-7 4-.5 6.5-3 7-7z" />
        </svg>
      );
  }
}

/**
 * 12種類のアイコン選択グリッドコンポーネント
 */
export function ListIconPicker({
  selectedIcon,
  onSelectIcon,
}: {
  selectedIcon: string;
  onSelectIcon: (iconId: ListIconId) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
      <label
        style={{
          fontSize: "0.74rem",
          fontWeight: 600,
          color: C.charcoalMid,
          letterSpacing: "0.02em",
        }}
      >
        マークを選択
      </label>
      <div
        data-testid="list-icon-picker"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: "0.45rem",
          padding: "0.25rem 0",
        }}
      >
        {LIST_ICONS.map((meta) => {
          const isSelected = (selectedIcon || "sparkle") === meta.id;
          return (
            <button
              key={meta.id}
              type="button"
              data-testid={`icon-opt-${meta.id}`}
              onClick={() => onSelectIcon(meta.id)}
              title={meta.label}
              style={{
                background: isSelected ? "rgba(184, 150, 90, 0.14)" : "var(--bg-nav-track)",
                border: isSelected ? `1.5px solid ${C.gold}` : "1px solid var(--border-subtle)",
                borderRadius: "10px",
                padding: "0.55rem 0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: isSelected ? C.goldDark : C.charcoal,
                transition: "all 0.15s ease",
                transform: isSelected ? "scale(1.04)" : "none",
              }}
            >
              <ListIcon icon={meta.id} size="1.05rem" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
