/**
 * src/components/dashboard/MealShoppingCard.tsx
 * Arca — サブグリッド左カラム（1.5fr）: レシピ
 *
 * 設計原則 (Core/Rules.md):
 *  - 枠線完全排除（border-none）、微細二重シャドウ、Apple HIG準拠
 *  - 絵文字完全排除（Lucide React SVGアイコンのみ）
 *  - 画一的右上リンク「〇〇 >」を全廃し、下部アクションボタン「買い物リストを見る (◯件)」へ再構築
 *  - レシピ行クリックで直接レシピ詳細に遷移（onSelectRecipe）
 *  - 0件時は中央スタック配置の Empty State（「レシピがありません」＋「+ レシピを追加」）
 */

import React from "react";
import { Utensils, ShoppingBag, Plus } from "lucide-react";
import type { Recipe } from "../../types/recipe";
import type { TaskItem } from "../../types";

export interface MealShoppingCardProps {
  recipes: Recipe[];
  tasks: TaskItem[];
  onNavigate?: (module: "dashboard" | "tasks" | "lists" | "calendar" | "notes" | "recipes" | "finance") => void;
  /** レシピIDを渡してレシピ詳細に直接遷移するコールバック */
  onSelectRecipe?: (recipeId: string) => void;
}

export const MealShoppingCard: React.FC<MealShoppingCardProps> = ({
  recipes,
  tasks,
  onNavigate,
  onSelectRecipe,
}) => {
  const activeRecipes = recipes.filter((r) => !r.isDeleted);
  const displayRecipes = [...activeRecipes]
    .sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return b.updatedAt - a.updatedAt;
    })
    .slice(0, 3);

  // 買い物リスト内の未完了タスク件数
  const shoppingCount = tasks.filter(
    (t) => (t.listId === "shopping" || (t as any).isShopping) && !t.completed
  ).length;

  return (
    <div
      data-testid="meal-shopping-card"
      className="bg-white dark:bg-[var(--bg-card-solid)] rounded-2xl p-5 shadow-xs flex flex-col h-full overflow-hidden border-none transition-all"
      style={{
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.025), 0 1px 3px rgba(0, 0, 0, 0.02)",
      }}
    >
      {/* ─── ヘッダー ─── */}
      <div className="flex items-center justify-between h-7 mb-3 pb-2 border-b border-stone-100 dark:border-stone-800 shrink-0">
        <div className="flex items-center gap-2">
          <Utensils size={16} className="text-amber-700 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-100 tracking-tight">
            レシピ
          </span>
          <span className="text-xs text-stone-400 dark:text-stone-500 font-medium">
            ({activeRecipes.length})
          </span>
        </div>
      </div>

      {/* ─── 本文（レシピリスト または Empty State） ─── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar">
        {displayRecipes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-2">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center mb-1.5">
              <Utensils size={15} className="text-amber-700 dark:text-amber-400" />
            </div>
            <p className="text-xs font-medium text-stone-600 dark:text-stone-300 m-0 mb-2">
              レシピがありません
            </p>
            <button
              type="button"
              onClick={() => onNavigate?.("recipes")}
              className="appearance-none inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F5F2EB] dark:bg-white/[0.08] text-[0.72rem] font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-500/15 transition-colors cursor-pointer border-none"
            >
              <Plus size={11} strokeWidth={2.5} />
              <span>レシピを追加</span>
            </button>
          </div>
        ) : (
          <div className="space-y-1.5 py-0.5">
            {displayRecipes.map((recipe) => (
              <div
                key={recipe.id}
                onClick={() => onSelectRecipe ? onSelectRecipe(recipe.id) : onNavigate?.("recipes")}
                className="group flex items-center justify-between p-2 rounded-xl hover:bg-[#F9F7F4] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 shrink-0" />
                  <span className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">
                    {recipe.title}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── フッター: 買い物リストアクションボタン ─── */}
      <div className="pt-2.5 mt-auto border-t border-stone-100 dark:border-stone-800 shrink-0">
        <button
          type="button"
          onClick={() => onNavigate?.("lists")}
          className="appearance-none w-full py-2 px-3 rounded-xl bg-[#F5F2EB] dark:bg-white/[0.08] hover:bg-amber-500/15 dark:hover:bg-white/[0.12] text-xs font-semibold text-stone-700 dark:text-stone-200 flex items-center justify-between transition-colors cursor-pointer border-none"
        >
          <div className="flex items-center gap-2">
            <ShoppingBag size={14} className="text-amber-700 dark:text-amber-400" />
            <span>買い物リストを見る</span>
          </div>
          <span className="text-[0.7rem] px-2 py-0.5 rounded-full bg-white dark:bg-[var(--bg-card-solid)] text-amber-800 dark:text-amber-300 font-bold">
            {shoppingCount}件
          </span>
        </button>
      </div>
    </div>
  );
};
