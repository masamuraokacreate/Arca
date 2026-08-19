/**
 * src/lib/designSystem.ts
 * Arca — Apple HIG × Arca デザインシステムトークン
 * 
 * 準拠ガイドライン:
 * - references/apple_hig_master.md
 * - Core/Rules.md
 */

export const C = {
  // ── 背景グラデーション (Ivory Base) ──
  bgGrad: "linear-gradient(155deg, #FAF8F5 0%, #F5F0E8 50%, #F0EAE0 100%)",
  bgApp: "#FAF8F5",
  bgEditor: "linear-gradient(180deg, #FDFCFA 0%, #F8F5F0 100%)",
  bgCard: "rgba(255, 255, 255, 0.72)",
  bgCardSolid: "#FDFCFA",
  bgCardHover: "rgba(255, 255, 255, 0.88)",
  bgGlass: "rgba(253, 252, 250, 0.82)",

  // ── アイボリーパレット ──
  ivory: "#F5F5F0",
  ivory2: "#EDE8DF",
  white: "#FDFCFA",

  // ── チャコールグレー (Text / Semantic) ──
  charcoal: "#2C2C2E",       // Primary Label
  charcoalMid: "#5A5A57",    // Secondary Label
  charcoalLight: "#8E8E93",  // Tertiary Label
  charcoalXLight: "#C7C7CC", // Quaternary Label / Placeholder

  // ── マットゴールド (Accent & Aether Core) ──
  gold: "#C5A059",
  goldDark: "#A8863D",
  goldFaint: "rgba(197, 160, 89, 0.08)",
  goldFaint2: "rgba(197, 160, 89, 0.14)",
  goldFaint3: "rgba(197, 160, 89, 0.24)",
  goldGlow: "0 0 24px rgba(197, 160, 89, 0.25)",

  // ── セージグリーン (Sync / Success) ──
  sage: "#52796F",
  sageFaint: "rgba(82, 121, 111, 0.10)",

  // ── 警告 / 削除 ──
  danger: "#C0614A",
  dangerFaint: "rgba(192, 97, 74, 0.08)",

  // ── 枠線なし・浮遊感のある柔らかなシャドウ ──
  cardShadow: "0 2px 16px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
  cardShadowHover: "0 6px 28px rgba(0, 0, 0, 0.07), 0 2px 6px rgba(0, 0, 0, 0.03)",
  cardShadowActive: "0 1px 6px rgba(0, 0, 0, 0.03)",
  toastShadow: "0 10px 40px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.06)",
  briefingShadow: "0 4px 32px rgba(197, 160, 89, 0.10), 0 1px 4px rgba(0, 0, 0, 0.02)",

  // ── 角丸 (HIG 準拠) ──
  radiusCard: "20px",
  radiusCardLg: "24px",
  radiusPill: "9999px",
  radiusBtn: "10px",
  radiusSm: "6px",
} as const;

export type DesignTokens = typeof C;
