/**
 * src/lib/designSystem.ts
 * Arca — Apple HIG × Arca デザインシステムトークン
 * 
 * 準拠ガイドライン:
 * - references/apple_hig_master.md
 * - Core/Rules.md
 */

export const C = {
  // ── 背景グラデーション & サーフェス (Theme Adaptive) ──
  bgGrad: "var(--bg-grad, linear-gradient(155deg, #FAF8F5 0%, #F5F0E8 50%, #F0EAE0 100%))",
  bgApp: "var(--bg-base, #FAF8F5)",
  bgEditor: "var(--bg-grad, linear-gradient(180deg, #FDFCFA 0%, #F8F5F0 100%))",
  bgCard: "var(--bg-card, rgba(255, 255, 255, 0.72))",
  bgCardSolid: "var(--bg-card-solid, #FDFCFA)",
  bgCardHover: "var(--bg-card-hover, rgba(255, 255, 255, 0.88))",
  bgGlass: "var(--bg-surface-glass, rgba(253, 252, 250, 0.88))",

  // ── サーフェス・アイボリーパレット ──
  ivory: "var(--color-ivory-tint, #F5F5F0)",
  ivory2: "var(--color-ivory-tint2, #EDE8DF)",
  white: "var(--bg-surface, #FDFCFA)",

  // ── チャコールグレー / テキスト (Theme Adaptive) ──
  charcoal: "var(--text-main, #2C2C2E)",       // Primary Label
  charcoalMid: "var(--text-mid, #5A5A57)",    // Secondary Label
  charcoalLight: "var(--text-muted, #8E8E93)",  // Tertiary Label
  charcoalXLight: "var(--text-xmuted, #C7C7CC)", // Quaternary Label / Placeholder

  // ── マットゴールド (Accent & Aether Core) ──
  gold: "var(--accent-gold, #C5A059)",
  goldDark: "var(--accent-gold-dark, #A8863D)",
  goldFaint: "var(--accent-gold-faint, rgba(197, 160, 89, 0.08))",
  goldFaint2: "var(--accent-gold-faint2, rgba(197, 160, 89, 0.14))",
  goldFaint3: "var(--accent-gold-faint3, rgba(197, 160, 89, 0.24))",
  goldGlow: "0 0 24px var(--accent-gold-glow, rgba(197, 160, 89, 0.25))",

  // ── セージグリーン (Sync / Success) ──
  sage: "#52796F",
  sageFaint: "rgba(82, 121, 111, 0.10)",

  // ── 警告 / 削除 ──
  danger: "#C0614A",
  dangerFaint: "rgba(192, 97, 74, 0.08)",

  // ── 枠線なし・浮遊感のある柔らかなシャドウ (Theme Adaptive) ──
  cardShadow: "var(--shadow-card, 0 2px 16px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02))",
  cardShadowHover: "var(--shadow-card-hover, 0 6px 28px rgba(0, 0, 0, 0.07), 0 2px 6px rgba(0, 0, 0, 0.03))",
  cardShadowActive: "0 1px 6px rgba(0, 0, 0, 0.03)",
  toastShadow: "0 10px 40px rgba(0, 0, 0, 0.20), 0 2px 8px rgba(0, 0, 0, 0.08)",
  modalShadow: "var(--shadow-modal, 0 12px 48px rgba(0, 0, 0, 0.16), 0 4px 16px rgba(0, 0, 0, 0.08))",
  briefingShadow: "var(--shadow-briefing, 0 4px 32px rgba(197, 160, 89, 0.10), 0 1px 4px rgba(0, 0, 0, 0.02))",

  // ── 角丸 (HIG 準拠) ──
  radiusCard: "20px",
  radiusCardLg: "24px",
  radiusModal: "24px",
  radiusPill: "9999px",
  radiusBtn: "10px",
  radiusSm: "6px",
} as const;

export type DesignTokens = typeof C;
