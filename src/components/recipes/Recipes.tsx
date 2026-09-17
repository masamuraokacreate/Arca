/**
 * src/components/recipes/Recipes.tsx
 * Arca — Recipes（料理レシピ）メインモジュール
 *
 * 設計原則 (Core/Rules.md & Apple HIG):
 * - アイボリーベースの繊細なグラデーション背景
 * - 写真が引き立つApple風カードグリッド / リスト切り替え
 * - タグ絞り込み、お気に入りフィルター、検索、ソート
 * - 料理中閲覧ビュー (RecipeDetail) ⇄ 構造化エディタ (RecipeEditor)
 * - 5秒間復元可能な UndoToast & 削除確認ダイアログ
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Search, X } from "lucide-react";
import type { Recipe, RecipeSortOption, RecipeViewMode } from "../../types/recipe";
import {
  subscribeRecipes,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  restoreRecipe,
  toggleFavoriteRecipe,
} from "../../lib/recipeStorage";
import { RecipeCard } from "./RecipeCard";
import { RecipeDetail } from "./RecipeDetail";
import { RecipeEditor } from "./RecipeEditor";
import { ConfirmModal } from "../notes/ConfirmModal";
import { useUndoToast } from "../../hooks/useUndoToast";
import { UndoToast } from "../common/UndoToast";
import { C } from "../../lib/designSystem";

// ── アイコン定義 ──
const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const StarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" style={{ flexShrink: 0 }}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const ChefPlaceholderIcon = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: C.goldDark, opacity: 0.8 }}>
    <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" />
    <line x1="6" y1="17" x2="18" y2="17" />
  </svg>
);

export interface RecipesProps {
  onNavigateToLists?: () => void;
  onDetailViewChange?: (isDetail: boolean) => void;
  /** ダッシュボードのレシピカードから直接遷移するレシピID */
  initialRecipeId?: string | null;
}

export default function Recipes({ onNavigateToLists, onDetailViewChange, initialRecipeId }: RecipesProps = {}) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [viewMode, setViewMode] = useState<RecipeViewMode>("list");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);

  // ダッシュボードから直接遷移してきた場合、指定レシピを詳細モードで開く
  useEffect(() => {
    if (initialRecipeId) {
      setSelectedRecipeId(initialRecipeId);
      setViewMode("detail");
    }
  }, [initialRecipeId]);

  // 詳細画面表示状態の親への通知（モバイルでのナビバー制御用）
  useEffect(() => {
    onDetailViewChange?.(viewMode === "detail");
    return () => {
      onDetailViewChange?.(false);
    };
  }, [viewMode, onDetailViewChange]);

  // フィルタ・ソート状態
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [sortBy, setSortBy] = useState<RecipeSortOption>("updatedDesc");
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 画面幅によるレスポンシブ自動判定（モバイル: リスト表示、PC/iPad等: 四角のグリッドカード表示）
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 640 : true
  );

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const updateMatch = () => setIsDesktop(media.matches);
    updateMatch();
    media.addEventListener("change", updateMatch);
    return () => media.removeEventListener("change", updateMatch);
  }, []);

  // 削除確認モーダル
  const [recipeToDelete, setRecipeToDelete] = useState<Recipe | null>(null);

  // 共通トースト
  const { toast, showUndoToast, dismissToast, triggerUndo } = useUndoToast<Recipe>();

  // ── Firestore リアルタイム同期 ──
  useEffect(() => {
    const unsubscribe = subscribeRecipes((fetched) => {
      setRecipes(fetched);
    });
    return () => unsubscribe();
  }, []);

  const activeRecipes = useMemo(
    () => recipes.filter((r) => !r.isDeleted),
    [recipes]
  );

  // 全タグの集計
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    activeRecipes.forEach((r) => {
      if (Array.isArray(r.tags)) {
        r.tags.forEach((t) => tagsSet.add(t));
      }
    });
    return Array.from(tagsSet).sort();
  }, [activeRecipes]);

  // 絞り込み ＆ ソート
  const filteredRecipes = useMemo(() => {
    return activeRecipes
      .filter((r) => {
        if (onlyFavorites && !r.favorite) return false;
        if (selectedTag !== "all" && (!r.tags || !r.tags.includes(selectedTag))) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = r.title.toLowerCase().includes(q);
          const matchNotes = r.notes?.toLowerCase().includes(q) || false;
          const matchIng = r.ingredients?.some((ing) => ing.name.toLowerCase().includes(q)) || false;
          return matchTitle || matchNotes || matchIng;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "favoriteFirst") {
          if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
          return b.updatedAt - a.updatedAt;
        }
        if (sortBy === "updatedDesc") return b.updatedAt - a.updatedAt;
        if (sortBy === "createdDesc") return b.createdAt - a.createdAt;
        if (sortBy === "titleAsc") return a.title.localeCompare(b.title);
        return 0;
      });
  }, [activeRecipes, onlyFavorites, selectedTag, searchQuery, sortBy]);

  // 現在選択されているレシピ
  const currentRecipe = useMemo(
    () => activeRecipes.find((r) => r.id === selectedRecipeId) || null,
    [activeRecipes, selectedRecipeId]
  );

  // ── ナビゲーション操作 ──
  const handleOpenDetail = useCallback((id: string) => {
    setIsFabMenuOpen(false);
    setIsSearchModalOpen(false);
    setSelectedRecipeId(id);
    setViewMode("detail");
  }, []);

  const handleOpenNew = useCallback(() => {
    setIsFabMenuOpen(false);
    setIsSearchModalOpen(false);
    setSelectedRecipeId(null);
    setViewMode("edit");
  }, []);

  const handleOpenEdit = useCallback((id: string) => {
    setIsFabMenuOpen(false);
    setIsSearchModalOpen(false);
    setSelectedRecipeId(id);
    setViewMode("edit");
  }, []);

  const handleBackToList = useCallback(() => {
    setIsFabMenuOpen(false);
    setIsSearchModalOpen(false);
    setViewMode("list");
    setSelectedRecipeId(null);
  }, []);

  // ── 保存処理 ──
  const handleSaveRecipe = async (recipeData: Omit<Recipe, "id">) => {
    if (selectedRecipeId && currentRecipe) {
      await updateRecipe(selectedRecipeId, recipeData);
      setViewMode("detail");
    } else {
      const newId = await createRecipe(recipeData);
      setSelectedRecipeId(newId);
      setViewMode("detail");
    }
  };

  // ── 削除処理（確認後実行 & Undo） ──
  const handleExecuteDelete = async (recipe: Recipe) => {
    await deleteRecipe(recipe.id);
    setRecipeToDelete(null);

    if (viewMode !== "list") {
      setViewMode("list");
      setSelectedRecipeId(null);
    }

    showUndoToast({
      message: `レシピ「${recipe.title || "無題のレシピ"}」を削除しました`,
      item: recipe,
      onUndo: async (restored) => {
        await restoreRecipe(restored.id);
      },
    });
  };

  // ── お気に入りトグル ──
  const handleToggleFavorite = async (recipe: Recipe) => {
    await toggleFavoriteRecipe(recipe.id, recipe.favorite);
  };

  return (
    <>
      {/* 画面全体の固定背景 */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -10,
          background: C.bgGrad,
          pointerEvents: "none",
        }}
      />

      {/* ── 閲覧モード ── */}
      {viewMode === "detail" && currentRecipe && (
        <RecipeDetail
          recipe={currentRecipe}
          onBack={handleBackToList}
          onEdit={() => handleOpenEdit(currentRecipe.id)}
          onDelete={() => setRecipeToDelete(currentRecipe)}
          onToggleFavorite={() => handleToggleFavorite(currentRecipe)}
          onNavigateToLists={onNavigateToLists}
        />
      )}

      {/* ── 編集モード ── */}
      {viewMode === "edit" && (
        <RecipeEditor
          initialRecipe={currentRecipe || undefined}
          onSave={handleSaveRecipe}
          onCancel={currentRecipe ? () => setViewMode("detail") : handleBackToList}
          onDelete={currentRecipe ? () => setRecipeToDelete(currentRecipe) : undefined}
        />
      )}

      {/* ── 一覧モード ── */}
      {viewMode === "list" && (
        <div
          className="arca-view-in"
          style={{
            minHeight: "100vh",
            width: "100%",
            padding: "2.4rem clamp(1.5rem, 5vw, 4rem) 6rem",
            boxSizing: "border-box",
          }}
        >
          {/* ── ヘッダー ── */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              marginBottom: "1.5rem",
              maxWidth: "1280px",
              marginInline: "auto",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 750,
                  color: C.charcoal,
                  margin: 0,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.2,
                }}
              >
                料理レシピ
              </h1>
            </div>

            {/* コントロール: 新規レシピ作成（PC・iPadなど画面幅 sm 以上でのみ表示） */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={handleOpenNew}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  background: C.gold,
                  border: "none",
                  borderRadius: "11px",
                  padding: "0.62rem 1.25rem",
                  cursor: "pointer",
                  color: "#FDFCFA",
                  fontSize: "0.82rem",
                  fontWeight: 650,
                  letterSpacing: "0.03em",
                  boxShadow: "0 2px 14px rgba(197,160,89,0.38)",
                  transition: "box-shadow 0.2s, transform 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "0 6px 24px rgba(197,160,89,0.48)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "0 2px 14px rgba(197,160,89,0.38)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <PlusIcon />
                <span>新しく作成</span>
              </button>
            </div>
          </div>

          {/* ── 検索・フィルター・ソート（PC・iPadなど画面幅 sm 以上でのみ常時表示） ── */}
          <div
            className="hidden sm:flex flex-col"
            style={{
              maxWidth: "1280px",
              marginInline: "auto",
              marginBottom: "2.2rem",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", alignItems: "center" }}>
              {/* 検索バー */}
              <div style={{ position: "relative", flex: "1 1 240px", maxWidth: "380px" }}>
                <span
                  style={{
                    position: "absolute",
                    left: "0.8rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    display: "flex",
                    alignItems: "center",
                    color: C.charcoalLight,
                    pointerEvents: "none",
                  }}
                >
                  <Search size={15} />
                </span>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="料理名・材料・知見を検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    background: "var(--bg-card-solid)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "10px",
                    padding: searchQuery ? "0.6rem 2.4rem 0.6rem 2.2rem" : "0.6rem 0.85rem 0.6rem 2.2rem",
                    fontSize: "0.85rem",
                    color: C.charcoal,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                {/* 検索クリアボタン */}
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      searchInputRef.current?.focus();
                    }}
                    style={{
                      position: "absolute",
                      right: "0.5rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      padding: "0.25rem",
                      cursor: "pointer",
                      color: C.charcoalLight,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    title="検索をクリア"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

              {/* お気に入りフィルター */}
              <button
                onClick={() => setOnlyFavorites((f) => !f)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  background: onlyFavorites ? C.goldFaint2 : "var(--bg-card-solid)",
                  border: onlyFavorites ? `1px solid ${C.gold}` : "1px solid var(--border-subtle)",
                  color: onlyFavorites ? C.goldDark : C.charcoalMid,
                  padding: "0.55rem 0.85rem",
                  borderRadius: "10px",
                  fontSize: "0.8rem",
                  fontWeight: onlyFavorites ? 650 : 500,
                  cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  transition: "all 0.15s ease",
                }}
              >
                <StarIcon />
                <span>お気に入りのみ</span>
              </button>

              {/* ソートセレクタ */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as RecipeSortOption)}
                aria-label="並び順"
                style={{
                  appearance: "none",
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  padding: "0.58rem 2rem 0.58rem 0.85rem",
                  fontSize: "0.8rem",
                  color: C.charcoalMid,
                  cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  outline: "none",
                  backgroundImage:
                    "url('data:image/svg+xml;utf8,<svg fill=\"%239A9A96\" height=\"24\" viewBox=\"0 0 24 24\" width=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M7 10l5 5 5-5z\"/></svg>')",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 0.3rem center",
                }}
              >
                <option value="updatedDesc">更新日が新しい順</option>
                <option value="createdDesc">作成日が新しい順</option>
                <option value="favoriteFirst">お気に入り優先</option>
                <option value="titleAsc">料理名順 (A-Z / あ-ん)</option>
              </select>
            </div>

            {/* タグピルフィルター */}
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
              <button
                onClick={() => setSelectedTag("all")}
                style={{
                  background: selectedTag === "all" ? C.charcoal : "transparent",
                  color: selectedTag === "all" ? C.white : C.charcoalMid,
                  border: "none",
                  borderRadius: "20px",
                  padding: "0.28rem 0.8rem",
                  fontSize: "0.74rem",
                  fontWeight: 550,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                すべて
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  style={{
                    background: selectedTag === tag ? C.gold : "transparent",
                    color: selectedTag === tag ? C.white : C.goldDark,
                    border: selectedTag === tag ? "1px solid transparent" : `1px solid ${C.goldFaint3}`,
                    borderRadius: "20px",
                    padding: "0.25rem 0.75rem",
                    fontSize: "0.74rem",
                    fontWeight: 550,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* ── モバイル用：アクティブ絞り込み条件バナー（検索中やタグ選択中のみ表示） ── */}
          {(searchQuery || selectedTag !== "all" || onlyFavorites) && (
            <div
              className="sm:hidden flex items-center justify-between gap-2"
              style={{
                maxWidth: "1280px",
                marginInline: "auto",
                marginBottom: "1rem",
                padding: "0.45rem 0.85rem",
                background: "var(--bg-card-solid)",
                border: `1px solid ${C.goldFaint3}`,
                borderRadius: "10px",
                fontSize: "0.78rem",
              }}
            >
              <div
                onClick={() => setIsSearchModalOpen(true)}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem", overflow: "hidden", cursor: "pointer", flex: 1 }}
                title="絞り込み条件を変更"
              >
                <Search size={13} color={C.goldDark} />
                <span style={{ color: C.charcoalMid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {searchQuery ? `「${searchQuery}」` : ""}
                  {selectedTag !== "all" ? ` #${selectedTag}` : ""}
                  {onlyFavorites ? " ★お気に入り" : ""}
                  {" の検索結果"}
                </span>
              </div>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedTag("all");
                  setOnlyFavorites(false);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: C.goldDark,
                  fontSize: "0.74rem",
                  fontWeight: 650,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  padding: "0.2rem 0.4rem",
                }}
              >
                クリア
              </button>
            </div>
          )}

          {/* ── レシピ一覧（モバイル: リスト表示のみ / PC・iPad: 四角のグリッドカード表示のみ） ── */}
          <div
            style={{
              maxWidth: "1280px",
              marginInline: "auto",
              display: "grid",
              gridTemplateColumns: isDesktop
                ? "repeat(auto-fill, minmax(280px, 1fr))"
                : "1fr",
              gap: isDesktop ? "1.25rem" : "0.85rem",
            }}
          >
            {filteredRecipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                viewMode={isDesktop ? "grid" : "list"}
                onClick={() => handleOpenDetail(recipe.id)}
                onEdit={(e) => {
                  e.stopPropagation();
                  handleOpenEdit(recipe.id);
                }}
                onDelete={(e) => {
                  e.stopPropagation();
                  setRecipeToDelete(recipe);
                }}
                onToggleFavorite={(e) => {
                  e.stopPropagation();
                  handleToggleFavorite(recipe);
                }}
              />
            ))}

            {/* 空状態（Empty State） */}
            {filteredRecipes.length === 0 && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "1rem",
                  padding: "5.5rem 2rem",
                  color: C.charcoalXLight,
                }}
              >
                <div
                  style={{
                    width: "72px",
                    height: "72px",
                    borderRadius: "50%",
                    background: C.goldFaint,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ChefPlaceholderIcon />
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "1.05rem", fontWeight: 650, color: C.charcoal, margin: "0 0 0.35rem" }}>
                    {searchQuery || selectedTag !== "all" || onlyFavorites
                      ? "条件に一致するレシピが見つかりませんでした"
                      : "登録されているレシピがまだありません"}
                  </p>
                  <p style={{ fontSize: "0.8rem", color: C.charcoalLight, margin: 0 }}>
                    日々の料理手順や次回の改善点（Chef's Review）を美しく記録しましょう
                  </p>
                </div>
                <button
                  onClick={handleOpenNew}
                  style={{
                    background: C.gold,
                    color: "#FDFCFA",
                    border: "none",
                    borderRadius: "10px",
                    padding: "0.65rem 1.4rem",
                    fontSize: "0.85rem",
                    fontWeight: 650,
                    cursor: "pointer",
                    boxShadow: "0 2px 10px rgba(197, 160, 89, 0.35)",
                    marginTop: "0.4rem",
                  }}
                >
                  最初のレシピを作成する
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 親指操作FAB (Floating Action Button - モバイルのみ表示) ── */}
      {viewMode === "list" && (
        <div
          className="fixed sm:hidden"
          style={{
            bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
            right: "1.25rem",
            zIndex: 100,
          }}
        >
          <button
            onClick={() => setIsFabMenuOpen((prev) => !prev)}
            data-testid="recipe-fab-main-button"
            aria-label={isFabMenuOpen ? "メニューを閉じる" : "アクションメニューを開く"}
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: C.gold,
              color: "#FFF",
              border: "none",
              boxShadow: "0 4px 16px rgba(197, 160, 89, 0.42)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s ease",
              transform: isFabMenuOpen ? "rotate(45deg)" : "rotate(0deg)",
            }}
          >
            <Plus size={26} strokeWidth={2.6} />
          </button>
        </div>
      )}

      {/* ── FAB展開アクションシート（半透明オーバーレイ付き ＆ 下からフワッと浮遊） ── */}
      {viewMode === "list" && isFabMenuOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99,
            backgroundColor: "rgba(0, 0, 0, 0.38)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: "1rem 1.25rem calc(5.5rem + env(safe-area-inset-bottom, 0px))",
            animation: "arca-fade-in 0.18s ease-out",
          }}
          onClick={() => setIsFabMenuOpen(false)}
        >
          <div
            data-testid="recipe-fab-menu"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.65rem",
              alignItems: "flex-end",
              animation: "arca-slide-up 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 1. 新しく作成 */}
            <button
              onClick={() => {
                setIsFabMenuOpen(false);
                handleOpenNew();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "9999px",
                padding: "0.65rem 1.15rem",
                fontSize: "0.85rem",
                fontWeight: 650,
                color: C.charcoal,
                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.12)",
                cursor: "pointer",
                animation: "arca-fab-btn-in 0.24s cubic-bezier(0.16, 1, 0.3, 1) both",
                animationDelay: "0.04s",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: C.gold,
                  color: "#FFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Plus size={16} strokeWidth={2.6} />
              </div>
              <span>新しく作成</span>
            </button>

            {/* 2. 検索 */}
            <button
              onClick={() => {
                setIsFabMenuOpen(false);
                setIsSearchModalOpen(true);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "9999px",
                padding: "0.65rem 1.15rem",
                fontSize: "0.85rem",
                fontWeight: 650,
                color: C.charcoal,
                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.12)",
                cursor: "pointer",
                animation: "arca-fab-btn-in 0.24s cubic-bezier(0.16, 1, 0.3, 1) both",
                animationDelay: "0s",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: C.goldFaint,
                  color: C.goldDark,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Search size={15} strokeWidth={2.2} />
              </div>
              <span>検索</span>
            </button>
          </div>
        </div>
      )}

      {/* ── レシピ検索・絞り込みポップアップモーダル ── */}
      {isSearchModalOpen && (
        <div
          data-testid="recipe-search-modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.45)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            animation: "arca-fade-in 0.15s ease-out",
          }}
          onClick={() => setIsSearchModalOpen(false)}
        >
          <div
            className="arca-card"
            style={{
              background: "var(--bg-card-solid)",
              borderRadius: "16px",
              padding: "1.3rem 1.4rem",
              boxShadow: "var(--shadow-modal)",
              width: "100%",
              maxWidth: "480px",
              maxHeight: "85vh",
              overflowY: "auto",
              animation: "arca-modal-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              boxSizing: "border-box",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <Search size={18} color={C.goldDark} />
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: C.charcoal, margin: 0 }}>
                  レシピ検索・絞り込み
                </h3>
              </div>
              <button
                onClick={() => setIsSearchModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: C.charcoalLight,
                  padding: "0.2rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="閉じる"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              {/* キーワード検索入力欄 */}
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 700, color: C.charcoalMid, display: "block", marginBottom: "0.4rem" }}>
                  キーワード検索
                </label>
                <div style={{ position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: "0.8rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      display: "flex",
                      alignItems: "center",
                      color: C.charcoalLight,
                      pointerEvents: "none",
                    }}
                  >
                    <Search size={15} />
                  </span>
                  <input
                    type="text"
                    placeholder="料理名・材料・知見を検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    style={{
                      width: "100%",
                      background: "var(--bg-nav-track)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "10px",
                      padding: searchQuery ? "0.6rem 2.4rem 0.6rem 2.2rem" : "0.6rem 0.85rem 0.6rem 2.2rem",
                      fontSize: "0.85rem",
                      color: C.charcoal,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      style={{
                        position: "absolute",
                        right: "0.5rem",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "transparent",
                        border: "none",
                        padding: "0.25rem",
                        cursor: "pointer",
                        color: C.charcoalLight,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="検索をクリア"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* タグで絞り込み */}
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 700, color: C.charcoalMid, display: "block", marginBottom: "0.5rem" }}>
                  タグで絞り込み
                </label>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", maxHeight: "160px", overflowY: "auto" }}>
                  <button
                    onClick={() => setSelectedTag("all")}
                    style={{
                      background: selectedTag === "all" ? C.charcoal : "var(--bg-nav-track)",
                      color: selectedTag === "all" ? C.white : C.charcoalMid,
                      border: "none",
                      borderRadius: "20px",
                      padding: "0.32rem 0.85rem",
                      fontSize: "0.75rem",
                      fontWeight: selectedTag === "all" ? 650 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    すべて
                  </button>
                  {allTags.map((tag) => {
                    const isSelected = selectedTag === tag;
                    return (
                      <button
                        key={tag}
                        onClick={() => setSelectedTag(isSelected ? "all" : tag)}
                        style={{
                          background: isSelected ? C.gold : "var(--bg-nav-track)",
                          color: isSelected ? C.white : C.goldDark,
                          border: isSelected ? "1px solid transparent" : `1px solid ${C.goldFaint3}`,
                          borderRadius: "20px",
                          padding: "0.3rem 0.8rem",
                          fontSize: "0.75rem",
                          fontWeight: isSelected ? 650 : 500,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* フィルター＆ソート */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                {/* お気に入りフィルター */}
                <div>
                  <label style={{ fontSize: "0.75rem", fontWeight: 700, color: C.charcoalMid, display: "block", marginBottom: "0.4rem" }}>
                    お気に入り
                  </label>
                  <button
                    onClick={() => setOnlyFavorites((f) => !f)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.35rem",
                      background: onlyFavorites ? C.goldFaint2 : "var(--bg-nav-track)",
                      border: onlyFavorites ? `1px solid ${C.gold}` : "1px solid var(--border-subtle)",
                      color: onlyFavorites ? C.goldDark : C.charcoalMid,
                      padding: "0.52rem 0.75rem",
                      borderRadius: "10px",
                      fontSize: "0.8rem",
                      fontWeight: onlyFavorites ? 650 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      boxSizing: "border-box",
                    }}
                  >
                    <StarIcon />
                    <span>お気に入りのみ</span>
                  </button>
                </div>

                {/* 並び順 */}
                <div>
                  <label style={{ fontSize: "0.75rem", fontWeight: 700, color: C.charcoalMid, display: "block", marginBottom: "0.4rem" }}>
                    並び順
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as RecipeSortOption)}
                    style={{
                      width: "100%",
                      background: "var(--bg-nav-track)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "10px",
                      padding: "0.52rem 0.75rem",
                      fontSize: "0.8rem",
                      color: C.charcoal,
                      outline: "none",
                      cursor: "pointer",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="updatedDesc">更新日が新しい順</option>
                    <option value="createdDesc">作成日が新しい順</option>
                    <option value="favoriteFirst">お気に入り優先</option>
                    <option value="titleAsc">料理名順</option>
                  </select>
                </div>
              </div>

              {/* リセット & 検索/完了ボタン */}
              <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.4rem" }}>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedTag("all");
                    setOnlyFavorites(false);
                  }}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "10px",
                    padding: "0.55rem",
                    fontSize: "0.82rem",
                    fontWeight: 650,
                    color: C.charcoalMid,
                    cursor: "pointer",
                  }}
                >
                  リセット
                </button>
                <button
                  onClick={() => setIsSearchModalOpen(false)}
                  style={{
                    flex: 1,
                    background: C.gold,
                    border: "none",
                    borderRadius: "10px",
                    padding: "0.55rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "#FFF",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(197,160,89,0.3)",
                  }}
                >
                  検索する ({filteredRecipes.length}件)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 削除確認ダイアログ (ConfirmModal) ── */}
      <ConfirmModal
        isOpen={!!recipeToDelete}
        title="レシピを削除しますか？"
        message={`「${recipeToDelete?.title || "無題のレシピ"}」を削除します。5秒以内であれば元に戻すことができます。`}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        isDestructive={true}
        onConfirm={() => {
          if (recipeToDelete) {
            handleExecuteDelete(recipeToDelete);
          }
        }}
        onCancel={() => setRecipeToDelete(null)}
      />

      {/* ── 共通 Undo トースト ── */}
      <UndoToast toast={toast} onUndo={triggerUndo} onDismiss={dismissToast} />
    </>
  );
}
