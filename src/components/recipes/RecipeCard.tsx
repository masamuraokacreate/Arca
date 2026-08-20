/**
 * src/components/recipes/RecipeCard.tsx
 * Arca — レシピカードコンポーネント (Apple HIG準拠)
 *
 * 設計原則:
 * - アイボリー背景に浮かぶ角丸カード（rounded-2xl + C.cardShadow）
 * - 完成写真（16:10 アスペクト比）とプレースホルダー
 * - 料理名、タグ、お気に入りバッジ、分量、最終更新日
 * - 「…」コンテキストメニュー（編集・削除）
 */

import React, { useState, useRef, useEffect } from "react";
import type { Recipe } from "../../types/recipe";
import { C } from "../../lib/designSystem";

// ── アイコン定義 ──
const StarFilledIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" style={{ color: "#E0A838", flexShrink: 0 }}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const StarOutlineIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: C.charcoalLight, flexShrink: 0 }}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const ChefHatIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: C.charcoalXLight, opacity: 0.65 }}>
    <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" />
    <line x1="6" y1="17" x2="18" y2="17" />
  </svg>
);

function formatRelativeDate(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - d.getTime());
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "今日";
  if (diffDays === 1) return "昨日";
  if (diffDays < 7) return `${diffDays}日前`;
  return d.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

export interface RecipeCardProps {
  recipe: Recipe;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}

export function RecipeCard({
  recipe,
  onClick,
  onEdit,
  onDelete,
  onToggleFavorite,
}: RecipeCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // メニュー外クリックで閉じる
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div
      className="arca-recipe-card"
      onClick={onClick}
      style={{
        background: C.white,
        borderRadius: "20px",
        overflow: "hidden",
        boxShadow: C.cardShadow,
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        transition: "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        border: "1px solid rgba(0, 0, 0, 0.03)",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = C.cardShadowHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = C.cardShadow;
      }}
    >
      {/* ── サムネイル画像 / プレースホルダー ── */}
      <div
        style={{
          width: "100%",
          height: "170px",
          position: "relative",
          background: "linear-gradient(135deg, #F9F6F0 0%, #EDE5D8 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt={recipe.title}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transition: "transform 0.35s ease",
            }}
            loading="lazy"
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem" }}>
            <ChefHatIcon />
            <span style={{ fontSize: "0.72rem", color: C.charcoalLight, letterSpacing: "0.04em", fontWeight: 500 }}>
              No Photo
            </span>
          </div>
        )}

        {/* お気に入りボタン（右上） */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(e);
          }}
          aria-label={recipe.favorite ? "お気に入り解除" : "お気に入りに追加"}
          style={{
            position: "absolute",
            top: "0.7rem",
            right: "0.7rem",
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "rgba(253, 252, 250, 0.88)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "transform 0.15s ease, background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          }}
        >
          {recipe.favorite ? <StarFilledIcon /> : <StarOutlineIcon />}
        </button>

        {/* 分量バッジ（左下） */}
        {recipe.servings && (
          <div
            style={{
              position: "absolute",
              bottom: "0.6rem",
              left: "0.6rem",
              background: "rgba(44, 44, 46, 0.72)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              color: "#FDFCFA",
              fontSize: "0.68rem",
              fontWeight: 600,
              padding: "0.2rem 0.55rem",
              borderRadius: "6px",
              letterSpacing: "0.02em",
            }}
          >
            {recipe.servings}
          </div>
        )}
      </div>

      {/* ── カード本文 ── */}
      <div
        style={{
          padding: "1.1rem 1.25rem 1.15rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.45rem",
          flex: 1,
        }}
      >
        {/* タイトル */}
        <h3
          style={{
            fontSize: "1.02rem",
            fontWeight: 700,
            color: C.charcoal,
            margin: 0,
            lineHeight: 1.38,
            letterSpacing: "-0.015em",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {recipe.title || "無題のレシピ"}
        </h3>

        {/* タイトル直下のゴールドタグ一覧 */}
        {recipe.tags && recipe.tags.length > 0 && (
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
            {recipe.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: "0.68rem",
                  color: C.gold,
                  background: C.goldFaint,
                  borderRadius: "5px",
                  padding: "0.12rem 0.45rem",
                  fontWeight: 500,
                  letterSpacing: "0.03em",
                }}
              >
                {tag}
              </span>
            ))}
            {recipe.tags.length > 3 && (
              <span style={{ fontSize: "0.62rem", color: C.charcoalLight }}>
                +{recipe.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* フッター（更新日 ＆ 「…」メニュー） */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "auto",
            paddingTop: "0.65rem",
            borderTop: "1px solid rgba(0, 0, 0, 0.045)",
          }}
        >
          <span style={{ fontSize: "0.68rem", color: C.charcoalXLight }}>
            {formatRelativeDate(recipe.updatedAt)} 更新
          </span>

          {/* 「…」メニュー */}
          <div
            ref={menuRef}
            style={{ position: "relative" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
              aria-label="メニュー"
              style={{
                background: menuOpen ? C.goldFaint2 : "transparent",
                border: "none",
                borderRadius: "6px",
                padding: "0.2rem 0.45rem",
                cursor: "pointer",
                color: C.charcoalLight,
                fontSize: "0.85rem",
                fontWeight: 700,
                lineHeight: 1,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = C.goldFaint;
              }}
              onMouseLeave={(e) => {
                if (!menuOpen) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              ···
            </button>

            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 4px)",
                  right: 0,
                  background: C.white,
                  borderRadius: "10px",
                  boxShadow: "0 6px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
                  padding: "0.35rem",
                  minWidth: "120px",
                  zIndex: 30,
                  border: "1px solid rgba(0, 0, 0, 0.05)",
                }}
              >
                <button
                  onClick={(e) => {
                    setMenuOpen(false);
                    onEdit(e);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    borderRadius: "7px",
                    padding: "0.5rem 0.75rem",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    color: C.charcoal,
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = C.goldFaint;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  編集する
                </button>
                <button
                  onClick={(e) => {
                    setMenuOpen(false);
                    onDelete(e);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    borderRadius: "7px",
                    padding: "0.5rem 0.75rem",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    color: C.danger,
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = C.dangerFaint;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  削除
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
