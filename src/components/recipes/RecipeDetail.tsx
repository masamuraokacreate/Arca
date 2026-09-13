/**
 * src/components/recipes/RecipeDetail.tsx
 * Arca — レシピ閲覧ビュー (Read-First / 料理中閲覧最適化)
 *
 * モバイル（iPhone）& PC（大画面）両対応レスポンシブ再設計:
 * - モバイル: グローバルナビ隠蔽 ＋ 専用Sticky Header（戻る・タイトル・お気に入り・編集・削除）
 * - モバイル: カード枠なしフラット背景、44×44px タップ領域確保、Safe Area対応
 * - PC (lg: 1024px+): 2カラム分割（左カラム Sticky 固定追従：写真・知見・材料・リンク / 右カラム：タイトル・手順）
 * - CHEF'S REVIEW: タイトル直下・材料の上へ昇格配置
 * - 材料リスト: 個別カートアイコン撤廃 ＋ プログレッシブ切替（選択して買い物リストへ ⇄ チェックボックス選択モード）
 * - 手順: ステップ間余白拡大（space-y-6 sm:space-y-8）、時間・温度のインライン視覚強調
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  Star,
  Pencil,
  Trash2,
  ShoppingCart,
  Check,
  Lightbulb,
  ExternalLink,
} from "lucide-react";
import type { Recipe } from "../../types/recipe";
import {
  addIngredientsToList,
  formatIngredientForList,
} from "../../lib/recipeListBridge";

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
      className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-[var(--bg-card)] backdrop-blur-md border border-[var(--border-subtle)] shadow-[var(--shadow-card)] text-[var(--text-main)] no-underline transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <img
        src={faviconUrl}
        alt=""
        className="w-7 h-7 rounded-lg object-contain bg-[var(--color-ivory-tint)] p-0.5 shrink-0"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
        <span className="text-xs font-semibold text-[var(--text-main)] truncate">
          {hostname} で参考レシピを見る
        </span>
        <span className="text-[11px] text-[var(--text-muted)] truncate">
          {url}
        </span>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
    </a>
  );
}

/**
 * 手順テキストの装飾パーサー（**太字** ＆ <u>下線</u> ＆ 時間・温度のインライン強調）
 */
function renderFormattedStepText(text: string): React.ReactNode {
  if (!text) return "（手順が未入力です）";

  // 1. Markdownの **太字** と <u>下線</u> と 改行 を分割
  const markdownRegex = /(\*\*[^*]+\*\*|<u>.*?<\/u>|\n)/g;
  const mainParts = text.split(markdownRegex);

  // 時間・温度検出用の正規表現（例: 約1分, 5〜6分, 170℃, 180°C, 200度, 30秒, 1時間半）
  const timeTempRegex = /(約?\s*\d+(?:[〜~-]\d+)?\s*(?:分(?:間)?|秒(?:間)?|時間(?:半)?|℃|°C|度))/g;

  return mainParts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      const content = part.slice(2, -2);
      return (
        <strong key={index} className="font-bold text-[var(--text-main)]">
          {content}
        </strong>
      );
    }

    if (part.startsWith("<u>") && part.endsWith("</u>") && part.length >= 7) {
      const content = part.slice(3, -4);
      return (
        <span
          key={index}
          className="underline underline-offset-[3px] decoration-[#C5A059] decoration-[1.5px] font-semibold"
        >
          {content}
        </span>
      );
    }

    if (part === "\n") {
      return <br key={index} />;
    }

    // 通常テキスト内で時間・温度を検出してインライン強調
    const subParts = part.split(timeTempRegex);
    return (
      <span key={index}>
        {subParts.map((subPart, subIdx) => {
          if (!subPart) return null;
          if (timeTempRegex.test(subPart)) {
            timeTempRegex.lastIndex = 0;
            return (
              <span
                key={subIdx}
                className="font-semibold text-[#A8863D] dark:text-[#E2C05E] bg-[rgba(197,160,89,0.12)] px-1.5 py-0.5 rounded text-[0.95em]"
              >
                {subPart}
              </span>
            );
          }
          return subPart;
        })}
      </span>
    );
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
  // スクロール状態（モバイルヘッダーでのタイトル表示判定）
  const [isScrolled, setIsScrolled] = useState(false);

  // 材料プログレッシブ選択モード
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIngIds, setSelectedIngIds] = useState<string[]>([]);
  const [isAddingBatch, setIsAddingBatch] = useState(false);

  // トースト通知
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // スクロール監視
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 60);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // リストに追加可能な有効な材料ID一覧
  const validIngredientIds = useMemo(() => {
    return (recipe.ingredients || [])
      .filter((ing) => !!formatIngredientForList(ing))
      .map((ing) => ing.id);
  }, [recipe.ingredients]);

  // 選択モード開始（デフォルト全選択）
  const handleStartSelection = () => {
    setSelectedIngIds(validIngredientIds);
    setIsSelectionMode(true);
  };

  // 選択モードキャンセル
  const handleCancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedIngIds([]);
  };

  // チェックボックス切り替え
  const handleToggleSelectIng = (id: string) => {
    setSelectedIngIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // 全選択 / 全解除
  const handleToggleSelectAll = () => {
    if (selectedIngIds.length === validIngredientIds.length) {
      setSelectedIngIds([]);
    } else {
      setSelectedIngIds(validIngredientIds);
    }
  };

  // 買い物リストへ一括追加の実行
  const handleExecuteBatchAdd = async () => {
    if (selectedIngIds.length === 0 || isAddingBatch) return;
    setIsAddingBatch(true);

    const itemsToAdd = (recipe.ingredients || []).filter((ing) =>
      selectedIngIds.includes(ing.id)
    );

    try {
      const count = await addIngredientsToList(recipe.title, itemsToAdd);
      setIsSelectionMode(false);
      setSelectedIngIds([]);

      setToastMessage(`${count}件を買い物リストに追加しました`);
      setTimeout(() => setToastMessage(null), 4500);
    } catch (err) {
      console.error("Failed to batch add ingredients to list:", err);
    } finally {
      setIsAddingBatch(false);
    }
  };

  return (
    <div className="arca-view-in w-full min-h-screen relative flex flex-col items-center">
      {/* ────── 1. ヘッダー (モバイル: Sticky / PC: フルワイドトップバー) ────── */}
      <header className="sticky lg:static top-0 z-40 w-full bg-[var(--bg-base)]/90 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none border-b border-black/5 dark:border-white/5 lg:border-none pt-[env(safe-area-inset-top,0px)] lg:pt-6 pb-0 lg:pb-2">
        <div className="flex items-center justify-between h-[52px] lg:h-auto px-2 lg:px-8 max-w-xl lg:max-w-7xl mx-auto w-full">
          {/* 左: 戻る */}
          <button
            type="button"
            onClick={onBack}
            title="レシピ一覧に戻る"
            aria-label="レシピ一覧に戻る"
            className="flex items-center justify-center lg:justify-start w-11 h-11 lg:w-auto lg:h-auto lg:px-3 lg:py-1.5 rounded-full lg:rounded-lg text-[var(--text-main)] lg:text-[var(--text-mid)] lg:hover:text-[var(--text-main)] active:bg-black/5 dark:active:bg-white/5 lg:active:bg-transparent transition-colors cursor-pointer text-sm font-medium gap-1.5"
          >
            <ArrowLeft className="w-5 h-5 lg:w-4 lg:h-4" />
            <span className="hidden lg:inline">レシピ一覧に戻る</span>
          </button>

          {/* 中央: タイトル（モバイルスクロール時のみ中央表示） */}
          <span
            className={`flex-1 min-w-0 text-center text-sm font-semibold text-[var(--text-main)] truncate px-2 transition-opacity duration-200 lg:hidden ${
              isScrolled ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={!isScrolled}
          >
            {isScrolled ? recipe.title || "無題のレシピ" : ""}
          </span>

          {/* 右: アクション群 */}
          <div className="flex items-center gap-0.5 lg:gap-2 shrink-0">
            {/* お気に入りトグル */}
            <button
              type="button"
              onClick={onToggleFavorite}
              title={recipe.favorite ? "お気に入りを解除" : "お気に入りに追加"}
              aria-label={recipe.favorite ? "お気に入りを解除" : "お気に入りに追加"}
              className="flex items-center justify-center lg:justify-start w-11 h-11 lg:w-auto lg:h-auto lg:px-3 lg:py-1.5 rounded-full lg:rounded-lg active:bg-black/5 dark:active:bg-white/5 lg:active:bg-transparent transition-colors cursor-pointer text-xs font-semibold gap-1.5"
              style={{ color: recipe.favorite ? "#A8863D" : undefined }}
            >
              <Star
                className={`w-5 h-5 lg:w-3.5 lg:h-3.5 ${
                  recipe.favorite
                    ? "fill-[#E0A838] text-[#E0A838]"
                    : "text-[var(--text-muted)]"
                }`}
              />
              <span
                className="hidden lg:inline text-[var(--text-mid)]"
                style={{ color: recipe.favorite ? "#A8863D" : undefined }}
              >
                {recipe.favorite ? "お気に入り中" : "お気に入り"}
              </span>
            </button>

            {/* 編集ボタン */}
            <button
              type="button"
              onClick={onEdit}
              title="レシピを編集"
              aria-label="レシピを編集"
              className="flex items-center justify-center lg:justify-start w-11 h-11 lg:w-auto lg:h-auto lg:px-3 lg:py-1.5 rounded-full lg:rounded-lg text-[var(--accent-gold-dark)] active:bg-black/5 dark:active:bg-white/5 lg:active:bg-transparent transition-colors cursor-pointer text-xs font-semibold gap-1.5"
            >
              <Pencil className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
              <span className="hidden lg:inline">編集</span>
            </button>

            {/* 削除ボタン */}
            <button
              type="button"
              onClick={onDelete}
              title="このレシピを削除"
              aria-label="このレシピを削除"
              className="flex items-center justify-center lg:justify-start w-11 h-11 lg:w-auto lg:h-auto lg:px-3 lg:py-1.5 rounded-full lg:rounded-lg text-red-500/80 hover:text-red-500 active:bg-red-500/10 lg:active:bg-transparent transition-colors cursor-pointer text-xs font-semibold gap-1.5"
            >
              <Trash2 className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
              <span className="hidden lg:inline">削除</span>
            </button>
          </div>
        </div>
      </header>

      {/* ────── 2. レスポンシブメインコンテナ ────── */}
      {/* モバイル: フラット背景・枠線なし・全幅 (max-w-xl mx-auto px-4 py-4 pb-24) */}
      {/* PC: 2カラム分割グリッド (grid grid-cols-12 gap-8 max-w-7xl mx-auto px-8 py-6) */}
      <div className="w-full max-w-xl lg:max-w-7xl mx-auto px-4 lg:px-8 py-4 lg:py-6 pb-24 lg:pb-16 flex flex-col lg:grid lg:grid-cols-12 lg:gap-8 gap-6 box-border">
        
        {/* ─── 左カラム (PC: col-span-5 固定追従 / モバイル: contents展開) ─── */}
        <div className="contents lg:block lg:col-span-5 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto no-scrollbar lg:bg-[var(--bg-card-solid)] lg:rounded-2xl lg:shadow-sm lg:p-6 lg:space-y-6 lg:border lg:border-[var(--border-subtle)]">
          
          {/* 【完成写真】 */}
          {recipe.imageUrl && (
            <div className="order-1 lg:order-none w-full rounded-2xl overflow-hidden shadow-sm bg-[var(--color-ivory-tint)]">
              <img
                src={recipe.imageUrl}
                alt={recipe.title}
                className="w-full h-auto max-h-[360px] object-cover block"
              />
            </div>
          )}

          {/* 【CHEF'S REVIEW（前回の知見・改善点）】: タイトル直下・材料の上に昇格配置 */}
          {recipe.notes?.trim() && (
            <section className="order-3 lg:order-none rounded-xl p-4 bg-amber-500/10 dark:bg-amber-500/15 border-none flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[var(--accent-gold-dark)]">
                <Lightbulb className="w-4 h-4 shrink-0 text-[#C5A059]" />
                <h3 className="text-xs font-bold tracking-wider uppercase m-0 text-[#A8863D] dark:text-[#E2C05E]">
                  Chef's Review（前回の知見・改善点）
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-[var(--text-main)] m-0 whitespace-pre-wrap font-normal">
                {recipe.notes}
              </p>
            </section>
          )}

          {/* 【材料・分量リスト】＆ プログレッシブ買い物リスト切替 */}
          <section className="order-4 lg:order-none flex flex-col gap-3">
            <div className="flex items-center justify-between border-b-2 border-black/5 dark:border-white/5 pb-2.5 flex-wrap gap-2">
              <div className="flex items-baseline gap-2.5 min-w-0">
                <h2 className="text-lg font-bold text-[var(--text-main)] m-0 tracking-tight">
                  材料・調味料
                </h2>

                {recipe.servings && (
                  <div className="inline-flex items-center gap-1 text-xs text-[var(--text-mid)] font-medium">
                    <span>分量:</span>
                    <span className="bg-[var(--color-ivory-tint2)] px-2 py-0.5 rounded font-semibold text-[var(--text-main)]">
                      {recipe.servings}
                    </span>
                  </div>
                )}
              </div>

              {/* プログレッシブ切替ボタン群 */}
              {recipe.ingredients && recipe.ingredients.length > 0 && (
                <div>
                  {!isSelectionMode ? (
                    <button
                      type="button"
                      onClick={handleStartSelection}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--accent-gold-dark)] bg-[var(--accent-gold-faint)] hover:bg-[var(--accent-gold-faint2)] active:scale-95 transition-all cursor-pointer"
                    >
                      <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                      <span>選択して買い物リストへ</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCancelSelection}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        disabled={selectedIngIds.length === 0 || isAddingBatch}
                        onClick={handleExecuteBatchAdd}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#C5A059] hover:bg-[#A8863D] active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {isAddingBatch
                            ? "追加中..."
                            : `この内容を買い物リストへ (${selectedIngIds.length}件)`}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 選択モード時の全選択 / 解除リンク */}
            {isSelectionMode && validIngredientIds.length > 1 && (
              <div className="flex justify-end pb-1">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="text-[11px] font-semibold text-[var(--accent-gold-dark)] hover:underline cursor-pointer"
                >
                  {selectedIngIds.length === validIngredientIds.length
                    ? "すべて解除"
                    : "すべて選択"}
                </button>
              </div>
            )}

            {/* 材料リスト本体 */}
            {recipe.ingredients && recipe.ingredients.length > 0 ? (
              <div className="divide-y divide-black/5 dark:divide-white/5">
                {recipe.ingredients.map((ing, idx) => {
                  const isValid = !!formatIngredientForList(ing);
                  const isSelected = selectedIngIds.includes(ing.id);

                  return (
                    <div
                      key={ing.id || idx}
                      onClick={
                        isSelectionMode && isValid
                          ? () => handleToggleSelectIng(ing.id)
                          : undefined
                      }
                      className={`flex items-center justify-between py-2.5 px-2 rounded-lg transition-colors min-w-0 ${
                        isSelectionMode && isValid
                          ? "cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                          : ""
                      } ${
                        isSelected && isSelectionMode
                          ? "bg-[var(--accent-gold-faint)]"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* 選択モード時のチェックボックス (44x44pxタップ領域相当) */}
                        {isSelectionMode && (
                          <div className="w-7 h-7 flex items-center justify-center shrink-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!isValid}
                              onChange={() => handleToggleSelectIng(ing.id)}
                              aria-label={`${ing.name || "材料"}を選択`}
                              className="w-4 h-4 rounded accent-[#C5A059] cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        )}

                        {/* 材料名 */}
                        <span className="text-sm font-medium text-[var(--text-main)] truncate">
                          {ing.name || "（未入力）"}
                        </span>
                      </div>

                      {/* 分量 */}
                      <span className="text-sm font-medium text-[var(--text-mid)] shrink-0 pl-3">
                        {ing.amount}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)] italic my-2">
                材料が登録されていません
              </p>
            )}
          </section>

          {/* 【参考元リンクカード】 */}
          {recipe.sourceUrl && (
            <div className="order-5 lg:order-none">
              <SourceLinkCard url={recipe.sourceUrl} />
            </div>
          )}
        </div>

        {/* ─── 右カラム (PC: col-span-7 / モバイル: contents展開) ─── */}
        <div className="contents lg:block lg:col-span-7 lg:bg-[var(--bg-card-solid)] lg:rounded-2xl lg:shadow-sm lg:p-8 lg:space-y-6 lg:border lg:border-[var(--border-subtle)]">
          
          {/* 【料理名 ＆ ゴールドタグ】 */}
          <header className="order-2 lg:order-none flex flex-col gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-main)] m-0 leading-snug">
              {recipe.title || "無題のレシピ"}
            </h1>

            <div className="flex items-center gap-1.5 flex-wrap">
              {recipe.tags && recipe.tags.length > 0 ? (
                recipe.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs font-medium text-[var(--accent-gold-dark)] bg-[var(--accent-gold-faint)] px-2.5 py-0.5 rounded-md tracking-wide"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-[var(--text-xmuted)]">タグなし</span>
              )}
            </div>
          </header>

          {/* 【作り方・調理手順】 */}
          <section className="order-6 lg:order-none flex flex-col gap-4">
            <div className="border-b-2 border-black/5 dark:border-white/5 pb-2.5">
              <h2 className="text-lg font-bold text-[var(--text-main)] m-0 tracking-tight">
                作り方・調理手順
              </h2>
            </div>

            {recipe.steps && recipe.steps.length > 0 ? (
              <ol className="space-y-6 sm:space-y-8 p-0 m-0 list-none">
                {recipe.steps.map((step, index) => (
                  <li
                    key={step.id || index}
                    className="flex items-start gap-4"
                  >
                    {/* ステップ番号バッジ */}
                    <span className="w-7 h-7 rounded-full bg-[#C5A059] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      {index + 1}
                    </span>

                    {/* 手順テキスト ＆ ステップ写真 */}
                    <div className="flex flex-col gap-2.5 flex-1 min-w-0">
                      <div
                        className="text-base leading-relaxed tracking-[0.01em]"
                        style={{ color: "var(--text-main)" }}
                      >
                        {renderFormattedStepText(step.text)}
                      </div>
                      {step.imageUrl && (
                        <div className="max-w-xs rounded-xl overflow-hidden mt-1 shadow-sm">
                          <img
                            src={step.imageUrl}
                            alt={`Step ${index + 1}`}
                            className="w-full h-auto block"
                          />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-[var(--text-muted)] italic my-2">
                調理手順が登録されていません
              </p>
            )}
          </section>
        </div>
      </div>

      {/* ────── 3. ピル型トースト通知 ────── */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-50 bg-[rgba(44,44,46,0.92)] dark:bg-[rgba(26,29,38,0.95)] backdrop-blur-md text-white px-5 py-2.5 rounded-full shadow-lg flex items-center gap-3 text-xs font-medium"
          style={{ animation: "toast-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          <span>{toastMessage}</span>
          {onNavigateToLists && (
            <button
              type="button"
              onClick={() => {
                setToastMessage(null);
                onNavigateToLists();
              }}
              className="bg-white/20 hover:bg-white/30 border-none rounded-full px-2.5 py-0.5 text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              リストを開く
            </button>
          )}
        </div>
      )}
    </div>
  );
}
