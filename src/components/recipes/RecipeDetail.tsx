/**
 * src/components/recipes/RecipeDetail.tsx
 * Arca — レシピ閲覧ビュー (Read-First / 料理中閲覧最適化)
 *
 * レイアウト順序 (Sprint 8.0 & 8.1 Aether Link):
 * 1. [ヘッダー]: 「← レシピ一覧」、お気に入り（1行・水平並び）、編集、削除（「削除」テキスト付き）
 * 2. 【完成写真】: 一番上にヒーロー表示（料理の顔として美しく配置）
 * 3. [タイトル & タグ]: 料理名 ＋ その直下にゴールドの小さめタグ (Notesモジュール準拠)
 * 4. [参考元リンクカード]: 中央配置のサムネイル/ファビコン付きURLプレビューカード
 * 5. [分量 & 材料リスト]:
 *    - 「🛒 まとめて買い物リストへ」一括送信ボタン
 *    - 各材料行ごとの個別「買い物リスト追加」ボタン（タップで ✓ に変化）
 * 6. [手順リスト]: ステップごとの見やすいテキスト表示（太字 **...** ＆ 下線 <u>...</u> の装飾レンダリング対応）
 * 7. 【Chef's Review】: 次回の改善点・知見・アレンジメモ（温かみのあるアイボリー/ゴールド枠カード）
 */

import React, { useState } from "react";
import type { Recipe, IngredientItem } from "../../types/recipe";
import { C } from "../../lib/designSystem";
import {
  addIngredientToList,
  addIngredientsToList,
  formatIngredientForList,
} from "../../lib/recipeListBridge";

// ── アイコン定義 ──
const ChevronLeftIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    <path d="m15 5 4 4" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const StarFilledIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" style={{ color: "#E0A838", flexShrink: 0 }}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const StarOutlineIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: C.charcoalLight, flexShrink: 0 }}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const SparkleNoteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: C.gold, flexShrink: 0 }}>
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
  </svg>
);

const CartPlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <circle cx="8" cy="21" r="1" />
    <circle cx="19" cy="21" r="1" />
    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="10" y1="10" x2="14" y2="10" />
  </svg>
);

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ── 参考元リンクプレビューカード ──
function SourceLinkCard({ url }: { url: string }) {
  let hostname = "";
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.replace(/^www\./, "");
  } catch {
    hostname = url;
  }
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.85rem",
        padding: "0.85rem 1.15rem",
        borderRadius: "14px",
        background: "rgba(255, 255, 255, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(0, 0, 0, 0.06)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.03)",
        textDecoration: "none",
        color: C.charcoal,
        transition: "all 0.18s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.06)";
        e.currentTarget.style.borderColor = C.goldFaint3;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.03)";
        e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.06)";
      }}
    >
      <img
        src={faviconUrl}
        alt=""
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "7px",
          objectFit: "contain",
          background: C.ivory,
          padding: "2px",
          flexShrink: 0,
        }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, gap: "0.15rem" }}>
        <span style={{ fontSize: "0.86rem", fontWeight: 650, color: C.charcoal, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {hostname} で参考レシピを見る
        </span>
        <span style={{ fontSize: "0.72rem", color: C.charcoalLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {url}
        </span>
      </div>
      <ExternalLinkIcon />
    </a>
  );
}

/**
 * 手順テキストの装飾パーサー（**太字** ＆ <u>下線</u> ＆ 改行対応）
 */
function renderFormattedStepText(text: string): React.ReactNode {
  if (!text) return "（手順が未入力です）";

  const regex = /(\*\*[^*]+\*\*|<u>.*?<\/u>|\n)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      const content = part.slice(2, -2);
      return (
        <strong
          key={index}
          style={{
            fontWeight: 700,
            color: C.charcoal,
          }}
        >
          {content}
        </strong>
      );
    }
    if (part.startsWith("<u>") && part.endsWith("</u>") && part.length >= 7) {
      const content = part.slice(3, -4);
      return (
        <span
          key={index}
          style={{
            textDecoration: "underline",
            textUnderlineOffset: "3px",
            textDecorationColor: C.gold,
            textDecorationThickness: "1.5px",
            fontWeight: 550,
          }}
        >
          {content}
        </span>
      );
    }
    if (part === "\n") {
      return <br key={index} />;
    }
    return <span key={index}>{part}</span>;
  });
}

export interface RecipeDetailProps {
  recipe: Recipe;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onNavigateToLists?: () => void;
}

export function RecipeDetail({
  recipe,
  onBack,
  onEdit,
  onDelete,
  onToggleFavorite,
  onNavigateToLists,
}: RecipeDetailProps) {
  // 個別追加されたアイテムID（一時的な ✓ 表示用）
  const [addedIngIds, setAddedIngIds] = useState<Record<string, boolean>>({});

  // 一括選択モーダル
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [selectedIngIds, setSelectedIngIds] = useState<string[]>([]);
  const [isAddingBatch, setIsAddingBatch] = useState(false);

  // トースト通知
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // ── 個別材料の追加 ──
  const handleAddSingleIngredient = async (e: React.MouseEvent, ing: IngredientItem) => {
    e.stopPropagation();
    const text = formatIngredientForList(ing);
    if (!text) return;

    try {
      await addIngredientToList(recipe.title, ing);
      setAddedIngIds((prev) => ({ ...prev, [ing.id]: true }));

      // 2秒後に ✓ を解除
      setTimeout(() => {
        setAddedIngIds((prev) => ({ ...prev, [ing.id]: false }));
      }, 2000);

      setToastMessage(`「${text}」を買い物リストに追加しました`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      console.error("Failed to add ingredient to list:", err);
    }
  };

  // ── 一括選択モーダルを開く ──
  const handleOpenBatchModal = () => {
    const validIds = (recipe.ingredients || [])
      .filter((ing) => !!formatIngredientForList(ing))
      .map((ing) => ing.id);
    setSelectedIngIds(validIds);
    setIsBatchModalOpen(true);
  };

  // ── 一括追加の実行 ──
  const handleExecuteBatchAdd = async () => {
    if (selectedIngIds.length === 0 || isAddingBatch) return;
    setIsAddingBatch(true);

    const itemsToAdd = (recipe.ingredients || []).filter((ing) =>
      selectedIngIds.includes(ing.id)
    );

    try {
      const count = await addIngredientsToList(recipe.title, itemsToAdd);
      setIsBatchModalOpen(false);

      // 追加されたアイテムすべてに一時的なチェックを付ける
      const newAdded: Record<string, boolean> = {};
      selectedIngIds.forEach((id) => {
        newAdded[id] = true;
      });
      setAddedIngIds(newAdded);
      setTimeout(() => setAddedIngIds({}), 2000);

      setToastMessage(`買い物リストに ${count} 件追加しました`);
      setTimeout(() => setToastMessage(null), 4500);
    } catch (err) {
      console.error("Failed to batch add ingredients to list:", err);
    } finally {
      setIsAddingBatch(false);
    }
  };

  const handleToggleSelectAll = () => {
    const validIds = (recipe.ingredients || [])
      .filter((ing) => !!formatIngredientForList(ing))
      .map((ing) => ing.id);
    if (selectedIngIds.length === validIds.length) {
      setSelectedIngIds([]);
    } else {
      setSelectedIngIds(validIds);
    }
  };

  const handleToggleSelectIng = (id: string) => {
    setSelectedIngIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <div
      className="arca-view-in"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        position: "relative",
      }}
    >
      {/* ────── 1. ヘッダー (Sticky / Apple HIG 準拠 / ボタンUI統一) ────── */}
      <header className="arca-toolbar">
        {/* 左: 戻る */}
        <button
          onClick={onBack}
          className="arca-tb-btn"
          title="レシピ一覧に戻る"
          style={{ paddingLeft: "0.2rem" }}
        >
          <ChevronLeftIcon />
          <span>レシピ一覧</span>
        </button>

        {/* 右: アクション群（水平1行レイアウト） */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          {/* お気に入りトグル（アイコンとテキストが水平に1行で並ぶ） */}
          <button
            onClick={onToggleFavorite}
            className="arca-tb-btn"
            title={recipe.favorite ? "お気に入りを解除" : "お気に入りに追加"}
            style={{ color: recipe.favorite ? C.goldDark : C.charcoalMid }}
          >
            {recipe.favorite ? <StarFilledIcon /> : <StarOutlineIcon />}
            <span>お気に入り</span>
          </button>

          {/* 編集ボタン */}
          <button
            onClick={onEdit}
            className="arca-tb-btn"
            title="レシピを編集"
            style={{ color: C.goldDark, fontWeight: 600 }}
          >
            <EditIcon />
            <span>編集</span>
          </button>

          {/* 削除ボタン（ゴミ箱 ＋ 「削除」テキスト、Destructive Action） */}
          <button
            onClick={onDelete}
            className="arca-tb-btn arca-tb-btn-delete"
            title="このレシピを削除"
          >
            <TrashIcon />
            <span>削除</span>
          </button>
        </div>
      </header>

      {/* ────── メイン本文コンテナ ────── */}
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          padding: "2.5rem clamp(1rem, 4vw, 3rem) 8rem",
          boxSizing: "border-box",
        }}
      >
        <article
          className="arca-layout-container"
          style={{
            width: "100%",
            maxWidth: "840px",
            background: "rgba(255, 255, 255, 0.88)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            borderRadius: "24px",
            boxShadow: "0 4px 28px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.8)",
            padding: "3.2rem clamp(1.5rem, 5vw, 4rem) 4.5rem",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: "2.2rem",
          }}
        >
          {/* ── 2. 【完成写真】: 一番上にヒーロー表示 ── */}
          {recipe.imageUrl && (
            <div
              style={{
                width: "100%",
                maxHeight: "400px",
                borderRadius: "18px",
                overflow: "hidden",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.06)",
                background: C.ivory,
              }}
            >
              <img
                src={recipe.imageUrl}
                alt={recipe.title}
                style={{
                  width: "100%",
                  height: "100%",
                  maxHeight: "400px",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>
          )}

          {/* ── 3. タイトル & タグ (Notesモジュール準拠) ── */}
          <header style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <h1
              style={{
                fontSize: "2.1rem",
                fontWeight: 750,
                color: C.charcoal,
                letterSpacing: "-0.03em",
                lineHeight: 1.25,
                margin: 0,
              }}
            >
              {recipe.title || "無題のレシピ"}
            </h1>

            {/* タイトル直下のゴールド小さめタグ */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
              {recipe.tags && recipe.tags.length > 0 ? (
                recipe.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: "0.72rem",
                      color: C.gold,
                      background: C.goldFaint,
                      borderRadius: "6px",
                      padding: "0.15rem 0.55rem",
                      letterSpacing: "0.04em",
                      fontWeight: 500,
                    }}
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span style={{ fontSize: "0.72rem", color: C.charcoalXLight }}>タグなし</span>
              )}
            </div>
          </header>

          {/* ── 4. 参考元リンクカード (中央配置) ── */}
          {recipe.sourceUrl && (
            <div>
              <SourceLinkCard url={recipe.sourceUrl} />
            </div>
          )}

          {/* ── 5. 分量 & 材料リスト ── */}
          <section style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: `2px solid ${C.ivory2}`,
                paddingBottom: "0.55rem",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.8rem" }}>
                <h2
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 700,
                    color: C.charcoal,
                    letterSpacing: "-0.02em",
                    margin: 0,
                  }}
                >
                  材料・調味料
                </h2>

                {recipe.servings && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      fontSize: "0.82rem",
                      color: C.charcoalMid,
                      fontWeight: 500,
                    }}
                  >
                    <span>分量:</span>
                    <span
                      style={{
                        background: C.ivory2,
                        padding: "0.15rem 0.55rem",
                        borderRadius: "6px",
                        color: C.charcoal,
                        fontWeight: 650,
                      }}
                    >
                      {recipe.servings}
                    </span>
                  </div>
                )}
              </div>

              {/* 🛒 一括追加ボタン */}
              {recipe.ingredients && recipe.ingredients.length > 0 && (
                <button
                  onClick={handleOpenBatchModal}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    background: C.goldFaint,
                    color: C.goldDark,
                    border: "none",
                    borderRadius: "8px",
                    padding: "0.38rem 0.8rem",
                    fontSize: "0.78rem",
                    fontWeight: 650,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = C.goldFaint2;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = C.goldFaint;
                  }}
                >
                  <CartPlusIcon />
                  <span>まとめて買い物リストへ</span>
                </button>
              )}
            </div>

            {recipe.ingredients && recipe.ingredients.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {recipe.ingredients.map((ing, idx) => {
                  const isAdded = !!addedIngIds[ing.id];
                  const hasName = !!ing.name.trim();

                  return (
                    <div
                      key={ing.id || idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.55rem 0.6rem",
                        borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
                        transition: "background 0.2s ease",
                        borderRadius: "8px",
                      }}
                    >
                      {/* 材料名 */}
                      <span
                        style={{
                          fontSize: "0.96rem",
                          color: C.charcoal,
                          fontWeight: 500,
                          flex: 1,
                        }}
                      >
                        {ing.name || "（未入力）"}
                      </span>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                        {/* 分量 */}
                        <span
                          style={{
                            fontSize: "0.92rem",
                            fontWeight: 600,
                            color: C.charcoalMid,
                            letterSpacing: "0.02em",
                          }}
                        >
                          {ing.amount}
                        </span>

                        {/* 個別追加ボタン (44x44px タップ領域確保) */}
                        {hasName && (
                          <button
                            onClick={(e) => handleAddSingleIngredient(e, ing)}
                            title={isAdded ? "買い物リストに追加済み" : "買い物リストに追加"}
                            aria-label={`${ing.name}を買い物リストに追加`}
                            style={{
                              width: "36px",
                              height: "36px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "8px",
                              border: "none",
                              background: isAdded ? C.goldFaint2 : "transparent",
                              color: isAdded ? C.goldDark : C.charcoalLight,
                              cursor: "pointer",
                              transition: "all 0.18s ease",
                            }}
                            onMouseEnter={(e) => {
                              if (!isAdded) {
                                e.currentTarget.style.background = C.ivory;
                                e.currentTarget.style.color = C.goldDark;
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isAdded) {
                                e.currentTarget.style.background = "transparent";
                                e.currentTarget.style.color = C.charcoalLight;
                              }
                            }}
                          >
                            {isAdded ? <CheckIcon /> : <CartPlusIcon />}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: "0.85rem", color: C.charcoalLight, fontStyle: "italic", margin: "0.5rem 0" }}>
                材料が登録されていません
              </p>
            )}
          </section>

          {/* ── 6. 手順リスト (太字・下線装飾レンダリング対応) ── */}
          <section style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
            <div style={{ borderBottom: `2px solid ${C.ivory2}`, paddingBottom: "0.55rem" }}>
              <h2
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: C.charcoal,
                  letterSpacing: "-0.02em",
                  margin: 0,
                }}
              >
                作り方・調理手順
              </h2>
            </div>

            {recipe.steps && recipe.steps.length > 0 ? (
              <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "1.3rem" }}>
                {recipe.steps.map((step, index) => (
                  <li
                    key={step.id || index}
                    style={{
                      display: "flex",
                      gap: "1.1rem",
                      alignItems: "flex-start",
                    }}
                  >
                    {/* ステップ番号バッジ */}
                    <span
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        background: C.gold,
                        color: "#FDFCFA",
                        fontSize: "0.85rem",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        marginTop: "0.15rem",
                        boxShadow: "0 2px 6px rgba(197, 160, 89, 0.3)",
                      }}
                    >
                      {index + 1}
                    </span>

                    {/* 手順テキスト ＆ ステップ写真 */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", flex: 1 }}>
                      <div
                        style={{
                          fontSize: "1.02rem",
                          lineHeight: 1.85,
                          color: C.charcoal,
                          margin: 0,
                          letterSpacing: "0.01em",
                        }}
                      >
                        {renderFormattedStepText(step.text)}
                      </div>
                      {step.imageUrl && (
                        <div style={{ maxWidth: "320px", borderRadius: "12px", overflow: "hidden", marginTop: "0.3rem" }}>
                          <img
                            src={step.imageUrl}
                            alt={`Step ${index + 1}`}
                            style={{ width: "100%", height: "auto", display: "block" }}
                          />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p style={{ fontSize: "0.85rem", color: C.charcoalLight, fontStyle: "italic", margin: "0.5rem 0" }}>
                調理手順が登録されていません
              </p>
            )}
          </section>

          {/* ── 7. 【Chef's Review】（最下部セクション） ── */}
          {recipe.notes && (
            <section
              style={{
                background: "linear-gradient(135deg, rgba(197, 160, 89, 0.08) 0%, rgba(245, 240, 232, 0.5) 100%)",
                border: "1px solid rgba(197, 160, 89, 0.28)",
                borderRadius: "16px",
                padding: "1.4rem 1.6rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
                marginTop: "0.8rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <SparkleNoteIcon />
                <h3
                  style={{
                    fontSize: "0.86rem",
                    fontWeight: 700,
                    color: C.goldDark,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    margin: 0,
                  }}
                >
                  Chef's Review（知見・次回改善点）
                </h3>
              </div>
              <p
                style={{
                  fontSize: "0.92rem",
                  color: C.charcoal,
                  margin: 0,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                }}
              >
                {recipe.notes}
              </p>
            </section>
          )}
        </article>
      </div>

      {/* ────── 一括選択・送信シート（モーダル） ────── */}
      {isBatchModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-add-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.35)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            boxSizing: "border-box",
          }}
          onClick={() => setIsBatchModalOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "480px",
              background: "#FFFFFF",
              borderRadius: "20px",
              boxShadow: "0 12px 40px rgba(0, 0, 0, 0.15)",
              padding: "1.8rem",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              gap: "1.2rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3
                  id="batch-add-title"
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 750,
                    color: C.charcoal,
                    margin: 0,
                    letterSpacing: "-0.02em",
                  }}
                >
                  買い物リストへまとめて追加
                </h3>
                <p style={{ fontSize: "0.78rem", color: C.charcoalLight, margin: "0.25rem 0 0" }}>
                  買いたい食材を選択してください
                </p>
              </div>

              <button
                type="button"
                onClick={handleToggleSelectAll}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: C.goldDark,
                  cursor: "pointer",
                  padding: "0.3rem 0.5rem",
                }}
              >
                {selectedIngIds.length ===
                (recipe.ingredients || []).filter((i) => !!formatIngredientForList(i)).length
                  ? "すべて解除"
                  : "すべて選択"}
              </button>
            </div>

            {/* 材料チェックボックス一覧 */}
            <div
              style={{
                maxHeight: "280px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
                padding: "0.2rem 0",
              }}
            >
              {(recipe.ingredients || [])
                .filter((ing) => !!formatIngredientForList(ing))
                .map((ing) => {
                  const isChecked = selectedIngIds.includes(ing.id);
                  return (
                    <label
                      key={ing.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.6rem 0.8rem",
                        borderRadius: "10px",
                        background: isChecked ? C.goldFaint : "rgba(0, 0, 0, 0.02)",
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "background 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelectIng(ing.id)}
                          style={{
                            width: "18px",
                            height: "18px",
                            accentColor: C.gold,
                            cursor: "pointer",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "0.9rem",
                            fontWeight: isChecked ? 600 : 450,
                            color: C.charcoal,
                          }}
                        >
                          {ing.name}
                        </span>
                      </div>
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: C.charcoalMid }}>
                        {ing.amount}
                      </span>
                    </label>
                  );
                })}
            </div>

            {/* フッターボタン群 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.6rem", marginTop: "0.4rem" }}>
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="arca-tb-btn"
                style={{ height: "36px", padding: "0 1rem" }}
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={handleExecuteBatchAdd}
                disabled={selectedIngIds.length === 0 || isAddingBatch}
                style={{
                  height: "36px",
                  padding: "0 1.25rem",
                  borderRadius: "9px",
                  background: selectedIngIds.length === 0 ? C.ivory2 : C.gold,
                  color: selectedIngIds.length === 0 ? C.charcoalLight : "#FDFCFA",
                  border: "none",
                  fontSize: "0.84rem",
                  fontWeight: 650,
                  cursor: selectedIngIds.length === 0 || isAddingBatch ? "default" : "pointer",
                  boxShadow:
                    selectedIngIds.length === 0
                      ? "none"
                      : "0 2px 10px rgba(197, 160, 89, 0.35)",
                  transition: "all 0.15s ease",
                }}
              >
                {isAddingBatch
                  ? "追加中..."
                  : `${selectedIngIds.length}件を買い物リストに追加`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────── ピル型トースト通知 ────── */}
      {toastMessage && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1100,
            background: "rgba(44, 44, 46, 0.92)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            color: "#FFFFFF",
            padding: "0.65rem 1.25rem",
            borderRadius: "9999px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            display: "flex",
            alignItems: "center",
            gap: "0.85rem",
            fontSize: "0.84rem",
            fontWeight: 500,
            animation: "toast-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <span>{toastMessage}</span>
          {onNavigateToLists && (
            <button
              onClick={() => {
                setToastMessage(null);
                onNavigateToLists();
              }}
              style={{
                background: "rgba(255, 255, 255, 0.2)",
                border: "none",
                borderRadius: "9999px",
                padding: "0.2rem 0.65rem",
                color: "#FFFFFF",
                fontSize: "0.78rem",
                fontWeight: 650,
                cursor: "pointer",
              }}
            >
              リストを開く
            </button>
          )}
        </div>
      )}
    </div>
  );
}
