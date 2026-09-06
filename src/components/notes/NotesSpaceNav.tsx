/**
 * src/components/notes/NotesSpaceNav.tsx
 * Arca — Notes 3大スペース切り替えナビゲーション (Apple HIG 準拠)
 *
 * [ LayoutGrid メモ | FileText ノート | BookOpen 日記 ]
 * 装飾絵文字は使用せず、すべて Lucide React SVG アイコンで統一。
 */

import { LayoutGrid, FileText, BookOpen } from "lucide-react";
import type { NoteSpaceType } from "../../types";
import { C } from "../../lib/designSystem";

interface NotesSpaceNavProps {
  activeSpace: NoteSpaceType;
  onChange: (space: NoteSpaceType) => void;
  counts?: {
    memo: number;
    document: number;
    journal: number;
  };
  variant?: "default" | "sidebar" | "inline" | "floating";
  className?: string;
}

interface SpaceConfig {
  id: NoteSpaceType;
  label: string;
  icon: typeof LayoutGrid;
  description: string;
}

const SPACES: SpaceConfig[] = [
  {
    id: "memo",
    label: "メモ",
    icon: LayoutGrid,
    description: "Keep風の軽快なカードグリッド",
  },
  {
    id: "document",
    label: "ノート",
    icon: FileText,
    description: "Notion風の階層ドキュメント",
  },
  {
    id: "journal",
    label: "日記",
    icon: BookOpen,
    description: "時系列ライフログ・タイムライン",
  },
];

export function NotesSpaceNav({
  activeSpace,
  onChange,
  counts,
  variant = "floating",
  className,
}: NotesSpaceNavProps) {
  // ── 0. フローティングDock用（画面最下部中央に常駐、全ページ共通） ──
  if (variant === "floating") {
    return (
      <nav
        role="tablist"
        aria-label="ノートスペース切り替え"
        className={`fixed left-1/2 -translate-x-1/2 z-40 select-none ${className || ""}`}
        style={{
          bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div
          className="inline-flex items-center p-1.5 rounded-2xl sm:rounded-full max-w-[calc(100vw-2rem)] overflow-x-auto shrink-0 backdrop-blur-2xl border border-black/[0.06] dark:border-white/[0.08] shadow-[0_10px_32px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.06)] gap-1"
          style={{
            background: "var(--bg-surface-glass)",
          }}
        >
          {SPACES.map((space) => {
            const Icon = space.icon;
            const isActive = activeSpace === space.id;
            const count = counts ? counts[space.id] : undefined;

            return (
              <button
                key={space.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`${space.label}スペース`}
                title={space.description}
                onClick={() => onChange(space.id)}
                className="appearance-none whitespace-nowrap shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl sm:rounded-full transition-all duration-200 cursor-pointer min-h-[42px] active:scale-95"
                style={{
                  background: isActive ? "var(--bg-card-solid)" : "transparent",
                  color: isActive ? C.goldDark : C.charcoalLight,
                  border: "none",
                  fontWeight: isActive ? 650 : 500,
                  fontSize: "0.84rem",
                  letterSpacing: "-0.01em",
                  boxShadow: isActive
                    ? "0 3px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)"
                    : "none",
                }}
              >
                <Icon
                  size={16}
                  strokeWidth={isActive ? 2.4 : 1.9}
                  style={{
                    color: isActive ? C.gold : C.charcoalLight,
                    flexShrink: 0,
                  }}
                />
                <span className="tracking-tight">{space.label}</span>
                {typeof count === "number" && count > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0.2 text-[10px] font-semibold shrink-0"
                    style={{
                      background: isActive ? C.goldFaint : "rgba(0,0,0,0.05)",
                      color: isActive ? C.goldDark : C.charcoalMid,
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  // ── 1. サイドバー用（横幅いっぱいに等幅3分割） ──
  if (variant === "sidebar") {
    return (
      <div
        role="tablist"
        aria-label="ノートスペース切り替え"
        className="flex items-center w-full p-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] select-none gap-1"
      >
        {SPACES.map((space) => {
          const Icon = space.icon;
          const isActive = activeSpace === space.id;
          const count = counts ? counts[space.id] : undefined;

          return (
            <button
              key={space.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`${space.label}スペース`}
              title={space.description}
              onClick={() => onChange(space.id)}
              className="appearance-none flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg transition-all duration-150 cursor-pointer min-h-[34px]"
              style={{
                background: isActive ? "var(--bg-card-solid)" : "transparent",
                color: isActive ? C.goldDark : C.charcoalLight,
                border: "none",
                fontWeight: isActive ? 650 : 500,
                fontSize: "0.78rem",
                letterSpacing: "-0.01em",
                boxShadow: isActive ? "0 1px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" : "none",
              }}
            >
              <Icon
                size={14}
                strokeWidth={isActive ? 2.4 : 1.9}
                style={{
                  color: isActive ? C.gold : C.charcoalLight,
                  flexShrink: 0,
                }}
              />
              <span className="truncate">{space.label}</span>
              {typeof count === "number" && count > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.2 text-[9px] font-semibold shrink-0"
                  style={{
                    background: isActive ? C.goldFaint : "rgba(0,0,0,0.05)",
                    color: isActive ? C.goldDark : C.charcoalMid,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // ── 2. インライン用（メモや日記のヘッダーバー等にコンパクト配置） ──
  if (variant === "inline") {
    return (
      <div
        role="tablist"
        aria-label="ノートスペース切り替え"
        className="inline-flex items-center p-1 rounded-2xl bg-black/[0.04] dark:bg-white/[0.05] select-none gap-1 shrink-0"
      >
        {SPACES.map((space) => {
          const Icon = space.icon;
          const isActive = activeSpace === space.id;
          const count = counts ? counts[space.id] : undefined;

          return (
            <button
              key={space.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`${space.label}スペース`}
              title={space.description}
              onClick={() => onChange(space.id)}
              className="appearance-none whitespace-nowrap shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all duration-150 cursor-pointer min-h-[36px]"
              style={{
                background: isActive ? "var(--bg-card-solid)" : "transparent",
                color: isActive ? C.goldDark : C.charcoalLight,
                border: "none",
                fontWeight: isActive ? 650 : 500,
                fontSize: "0.8rem",
                letterSpacing: "-0.01em",
                boxShadow: isActive ? "0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" : "none",
              }}
            >
              <Icon
                size={15}
                strokeWidth={isActive ? 2.4 : 1.9}
                style={{
                  color: isActive ? C.gold : C.charcoalLight,
                  flexShrink: 0,
                }}
              />
              <span>{space.label}</span>
              {typeof count === "number" && count > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.2 text-[10px] font-semibold shrink-0"
                  style={{
                    background: isActive ? C.goldFaint : "rgba(0,0,0,0.05)",
                    color: isActive ? C.goldDark : C.charcoalMid,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // ── 3. デフォルト（中央配置） ──
  return (
    <div
      role="tablist"
      aria-label="ノートスペース切り替え"
      className="flex items-center justify-center w-full my-3 px-2 select-none"
    >
      <div
        className="inline-flex items-center p-1 rounded-2xl max-w-full overflow-x-auto shrink-0"
        style={{
          background: "rgba(0, 0, 0, 0.04)",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.03)",
          gap: "4px",
        }}
      >
        {SPACES.map((space) => {
          const Icon = space.icon;
          const isActive = activeSpace === space.id;
          const count = counts ? counts[space.id] : undefined;

          return (
            <button
              key={space.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`${space.label}スペース`}
              title={space.description}
              onClick={() => onChange(space.id)}
              className="appearance-none whitespace-nowrap shrink-0 flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl transition-all duration-150 cursor-pointer min-h-[40px]"
              style={{
                background: isActive ? "var(--bg-card-solid)" : "transparent",
                color: isActive ? C.goldDark : C.charcoalLight,
                border: "none",
                fontWeight: isActive ? 650 : 500,
                fontSize: "0.82rem",
                letterSpacing: "-0.01em",
                boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" : "none",
              }}
            >
              <Icon
                size={16}
                strokeWidth={isActive ? 2.4 : 1.9}
                style={{
                  color: isActive ? C.gold : C.charcoalLight,
                  flexShrink: 0,
                }}
              />
              <span>{space.label}</span>
              {typeof count === "number" && count > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.2 text-[10px] font-semibold shrink-0"
                  style={{
                    background: isActive ? C.goldFaint : "rgba(0,0,0,0.05)",
                    color: isActive ? C.goldDark : C.charcoalMid,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
