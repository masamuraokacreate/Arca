/**
 * src/components/common/ArcaLogo.tsx
 * Arca — 公式ロゴコンポーネント (Apple HIG 準拠・レスポンシブ・歪み防止)
 *
 * 特徴:
 *  - ダークモード時は whilte、ライトモード時は black の公式ロゴ画像を自動切り替え
 *  - variant:
 *      - "wordmark": 純粋なブランドワードマーク（Arca 文字ロゴ画像）
 *      - "symbol": 正方形アプリアイコンマーク
 *      - "combined": シンボルアイコン ＋ ワードマークの洗練されたセット
 *      - "full": フルロゴ
 *  - PNG / SVG 形式の両方に対応（デフォルトは高精細透過PNG）
 *  - アスペクト比保護 & 歪み・アンチエイリアスぼやけ防止
 */

import React from "react";
import logoBlackPng from "../../assets/arca_logo_black_trans.png";
import logoWhitePng from "../../assets/arca-logo_whilte_trans.png";
import arcaLogoImg from "../../assets/Arca_logo.png";
import arcaIconImg from "../../assets/Arca_icon.png";
import { useTheme } from "../../context/ThemeContext";

export type LogoVariant = "wordmark" | "symbol" | "combined" | "full";
export type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";
export type LogoFormat = "png";

export interface ArcaLogoProps {
  /**
   * バリアント:
   * - "wordmark": 「Arca」文字ロゴ画像（ライト: black, ダーク: white）
   * - "symbol": シンボルアイコンのみ（アプリアイコンマーク）
   * - "combined": シンボルアイコン ＋ ワードマークの組み合わせ
   * - "full": ブランドロゴ全体（Arca Everything has a place...）
   */
  variant?: LogoVariant;
  /** サイズプリセットまたはピクセル指定（シンボル時: 正方形サイズ / ワードマーク時: 高さ） */
  size?: LogoSize | number;
  /** ワードマークの高さ明示指定（px） */
  height?: number;
  /** 画像フォーマット（"png" または "svg"、デフォルト: "png"） */
  format?: LogoFormat;
  /** ダークモード明示指定（省略時はテーマから自動判定） */
  isDark?: boolean;
  /** 追加クラス名 */
  className?: string;
  /** 画像用インラインスタイル */
  style?: React.CSSProperties;
  /** alt 属性 */
  alt?: string;
}

const SYMBOL_SIZE_MAP: Record<LogoSize, { width: number; height: number; radius: string; shadow: string }> = {
  xs: { width: 18, height: 18, radius: "4.5px", shadow: "0 1px 2px rgba(148, 163, 184, 0.15)" },
  sm: { width: 24, height: 24, radius: "6.5px", shadow: "0 1px 3px rgba(148, 163, 184, 0.2)" },
  md: { width: 40, height: 40, radius: "10px", shadow: "0 2px 8px rgba(148, 163, 184, 0.2)" },
  lg: { width: 70, height: 70, radius: "16px", shadow: "0 10px 25px -4px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04)" },
  xl: { width: 90, height: 90, radius: "20px", shadow: "0 14px 30px -4px rgba(0, 0, 0, 0.15), 0 4px 10px rgba(0, 0, 0, 0.06)" },
};

const WORDMARK_HEIGHT_MAP: Record<LogoSize, number> = {
  xs: 15,
  sm: 18,
  md: 26,
  lg: 36,
  xl: 52,
};

// ワードマークのアスペクト比: 680 / 240 ≈ 2.833
const WORDMARK_ASPECT_RATIO = 680 / 240;

export const ArcaLogo: React.FC<ArcaLogoProps> = ({
  variant = "symbol",
  size = "sm",
  height,
  format = "png",
  isDark: explicitIsDark,
  className = "",
  style,
  alt = "Arca",
}) => {
  // テーマコンテキストからの安全なダーク判定
  let contextIsDark = false;
  try {
    const themeCtx = useTheme();
    contextIsDark = themeCtx.isDark;
  } catch {
    if (typeof document !== "undefined") {
      contextIsDark =
        document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark";
    }
  }

  const effectiveIsDark = explicitIsDark !== undefined ? explicitIsDark : contextIsDark;

  // ワードマーク画像パスの決定（ダークモード: whilte透過PNG / ライトモード: black透過PNG）
  const wordmarkSrc = effectiveIsDark ? logoWhitePng : logoBlackPng;

  // ── 1. ワードマーク単体表示 ──
  if (variant === "wordmark") {
    const resolvedHeight =
      height !== undefined
        ? height
        : typeof size === "number"
        ? size
        : WORDMARK_HEIGHT_MAP[size] || WORDMARK_HEIGHT_MAP.sm;
    const resolvedWidth = Math.round(resolvedHeight * WORDMARK_ASPECT_RATIO);

    return (
      <img
        src={wordmarkSrc}
        alt={alt}
        draggable={false}
        className={`select-none touch-none pointer-events-none shrink-0 ${className}`}
        style={{
          height: `${resolvedHeight}px`,
          width: `${resolvedWidth}px`,
          maxWidth: "100%",
          aspectRatio: "680 / 240",
          objectFit: "contain",
          WebkitTouchCallout: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          ...style,
        }}
      />
    );
  }

  // ── 2. シンボル ＋ ワードマークの組み合わせ ──
  if (variant === "combined") {
    const symbolPx = typeof size === "number" ? size : SYMBOL_SIZE_MAP[size]?.width || 26;
    const wordmarkPx = Math.round(symbolPx * 0.82);

    return (
      <div
        className={`inline-flex items-center select-none ${className}`}
        style={{ gap: "0.5rem", ...style }}
      >
        <ArcaLogo variant="symbol" size={symbolPx} isDark={effectiveIsDark} alt="" />
        <ArcaLogo variant="wordmark" height={wordmarkPx} format={format} isDark={effectiveIsDark} alt={alt} />
      </div>
    );
  }

  // ── 3. シンボルアイコン または フルロゴ ──
  const imgSrc = variant === "full" ? arcaLogoImg : arcaIconImg;

  const resolved =
    typeof size === "number"
      ? {
          width: size,
          height: size,
          radius: `${Math.round(size * 0.24)}px`,
          shadow: "0 2px 8px rgba(148, 163, 184, 0.18)",
        }
      : SYMBOL_SIZE_MAP[size] || SYMBOL_SIZE_MAP.sm;

  return (
    <img
      src={imgSrc}
      alt={alt}
      draggable={false}
      className={`select-none touch-none pointer-events-none shrink-0 ${className}`}
      style={{
        width: `${resolved.width}px`,
        height: `${resolved.height}px`,
        maxWidth: "100%",
        maxHeight: "100%",
        aspectRatio: "1 / 1",
        objectFit: "contain",
        borderRadius: resolved.radius,
        boxShadow: resolved.shadow,
        WebkitTouchCallout: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        ...style,
      }}
    />
  );
};

export default ArcaLogo;
