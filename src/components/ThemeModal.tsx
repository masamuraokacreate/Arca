/**
 * src/components/ThemeModal.tsx
 * Arca — Apple HIG準拠の外観・テーマ設定モーダル
 */

import { useEffect } from "react";
import { useTheme, type ThemeMode } from "../context/ThemeContext";
import { C } from "../lib/designSystem";

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PaletteOption {
  id: ThemeMode;
  name: string;
  subname: string;
  desc: string;
  isDark: boolean;
  preview: {
    bgGrad: string;
    cardBg: string;
    textMain: string;
    textMuted: string;
    accent: string;
  };
}

const PALETTES: PaletteOption[] = [
  {
    id: "ivory",
    name: "アイボリー",
    subname: "Ivory Light",
    desc: "穏やかなオフホワイトとマットゴールドの自然な調和",
    isDark: false,
    preview: {
      bgGrad: "linear-gradient(135deg, #FAF8F5 0%, #F5F0E8 100%)",
      cardBg: "#FFFFFF",
      textMain: "#2C2C2E",
      textMuted: "#8E8E93",
      accent: "#C5A059",
    },
  },
  {
    id: "dark",
    name: "ディープスペース",
    subname: "Deep Space",
    desc: "静寂な漆黒と上品なマットゴールドのナイトモード",
    isDark: true,
    preview: {
      bgGrad: "linear-gradient(135deg, #0D0E12 0%, #161822 100%)",
      cardBg: "#16181F",
      textMain: "#F2F2F7",
      textMuted: "#8E8E93",
      accent: "#D4AF37",
    },
  },
  {
    id: "sand",
    name: "ウォームサンド",
    subname: "Warm Sand",
    desc: "砂丘を想起させるリッチで温もりのあるベージュ",
    isDark: false,
    preview: {
      bgGrad: "linear-gradient(135deg, #F7F2EB 0%, #E8DEC9 100%)",
      cardBg: "#FAF6F0",
      textMain: "#332B24",
      textMuted: "#998A7D",
      accent: "#C49746",
    },
  },
  {
    id: "sage",
    name: "ミッドナイトセージ",
    subname: "Midnight Sage",
    desc: "森林の静寂と安らぎを宿したディープグリーン",
    isDark: true,
    preview: {
      bgGrad: "linear-gradient(135deg, #101715 0%, #1A2823 100%)",
      cardBg: "#182420",
      textMain: "#EDF4F1",
      textMuted: "#7D948D",
      accent: "#D8B763",
    },
  },
];

export default function ThemeModal({ isOpen, onClose }: ThemeModalProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  // Escapeキーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "arca-module-in 0.2s ease-out forwards",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="arca-card"
        style={{
          width: "100%",
          maxWidth: "520px",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--bg-card-solid)",
          borderRadius: "24px",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-modal)",
          padding: "1.6rem 1.8rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.4rem",
          boxSizing: "border-box",
          position: "relative",
          transition: "background 0.25s ease, color 0.25s ease",
        }}
      >
        {/* ── ヘッダー ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 750, color: C.charcoal, margin: 0, letterSpacing: "-0.02em" }}>
                外観・テーマ設定
              </h2>
            </div>
            <p style={{ fontSize: "0.76rem", color: C.charcoalLight, margin: "0.3rem 0 0" }}>
              自動を選択した際、昼はアイボリー、夜はディープスペースが選択されます
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: "var(--bg-nav-track)",
              border: "none",
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.charcoalMid,
              cursor: "pointer",
              transition: "all 0.15s ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(0, 0, 0, 0.1)";
              e.currentTarget.style.color = C.charcoal;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-nav-track)";
              e.currentTarget.style.color = C.charcoalMid;
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── 1. 外観モード (セグメントコントロール) ── */}
        <div>
          <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 650, color: C.charcoalMid, marginBottom: "0.5rem" }}>
            外観モード
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "0.35rem",
              background: "var(--bg-nav-track)",
              padding: "4px",
              borderRadius: "12px",
            }}
          >
            {/* 手動 */}
            <button
              type="button"
              onClick={() => {
                if (theme === "system") {
                  setTheme(resolvedTheme);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                padding: "0.55rem 0.5rem",
                borderRadius: "9px",
                border: "none",
                fontSize: "0.78rem",
                fontWeight: 650,
                cursor: "pointer",
                transition: "all 0.18s ease",
                background: theme !== "system" ? "var(--bg-nav-pill)" : "transparent",
                color: theme !== "system" ? "var(--text-main)" : C.charcoalLight,
                boxShadow: theme !== "system" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <span>手動</span>
            </button>

            {/* OS連動 */}
            <button
              type="button"
              onClick={() => setTheme("system")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                padding: "0.55rem 0.5rem",
                borderRadius: "9px",
                border: "none",
                fontSize: "0.78rem",
                fontWeight: 650,
                cursor: "pointer",
                transition: "all 0.18s ease",
                background: theme === "system" ? "var(--bg-nav-pill)" : "transparent",
                color: theme === "system" ? "var(--text-main)" : C.charcoalLight,
                boxShadow: theme === "system" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <span>OS連動</span>
            </button>
          </div>
        </div>

        {/* ── 2. カラーパレット選択 ── */}
        <div>
          <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 650, color: C.charcoalMid, marginBottom: "0.6rem" }}>
            カラーパレット
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "0.8rem" }}>
            {PALETTES.map((pal) => {
              const isSelected = theme === pal.id || (theme === "system" && resolvedTheme === pal.id);

              return (
                <div
                  key={pal.id}
                  onClick={() => setTheme(pal.id)}
                  style={{
                    borderRadius: "16px",
                    padding: "0.85rem",
                    cursor: "pointer",
                    background: pal.preview.bgGrad,
                    border: isSelected
                      ? `2px solid ${C.gold}`
                      : "2px solid rgba(0, 0, 0, 0.06)",
                    boxShadow: isSelected
                      ? `0 4px 18px ${C.goldFaint3}`
                      : "0 1px 4px rgba(0, 0, 0, 0.04)",
                    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.65rem",
                    position: "relative",
                    overflow: "hidden",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.08)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.04)";
                    }
                  }}
                >
                  {/* ミニUIプレビュー */}
                  <div
                    style={{
                      background: pal.preview.cardBg,
                      borderRadius: "10px",
                      padding: "0.6rem 0.75rem",
                      boxShadow: "0 1px 6px rgba(0, 0, 0, 0.06)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.35rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background: pal.preview.accent,
                          }}
                        />
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: pal.preview.textMain }}>
                          {pal.name}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: "0.62rem",
                          fontWeight: 650,
                          color: pal.preview.accent,
                          background: "rgba(197, 160, 89, 0.12)",
                          padding: "0.1rem 0.35rem",
                          borderRadius: "4px",
                        }}
                      >
                        Arca
                      </span>
                    </div>

                    <div style={{ height: "4px", width: "65%", background: pal.preview.textMuted, opacity: 0.3, borderRadius: "2px" }} />
                    <div style={{ height: "4px", width: "40%", background: pal.preview.textMuted, opacity: 0.2, borderRadius: "2px" }} />
                  </div>

                  {/* パレット説明 */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <span
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          color: pal.preview.textMain,
                          display: "block",
                        }}
                      >
                        {pal.name}
                      </span>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          color: pal.preview.textMuted,
                          display: "block",
                          marginTop: "1px",
                        }}
                      >
                        {pal.subname}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── フッター ── */}
        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "0.4rem" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: C.gold,
              color: "#FFF",
              border: "none",
              borderRadius: "11px",
              padding: "0.55rem 1.4rem",
              fontSize: "0.82rem",
              fontWeight: 650,
              cursor: "pointer",
              boxShadow: `0 2px 10px ${C.goldFaint3}`,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            完了
          </button>
        </div>
      </div>
    </div>
  );
}
