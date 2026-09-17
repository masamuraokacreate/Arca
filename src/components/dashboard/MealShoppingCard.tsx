/**
 * src/components/dashboard/MealShoppingCard.tsx
 * Arca — サブグリッド左カラム（1.5fr）: 今サイクルの献立 ＆ 買い物
 *
 * 設計原則 (Core/Rules.md):
 *  - 枠線完全排除（border-none）、微細二重シャドウ、Apple HIG準拠
 *  - 絵文字完全排除（Lucide React SVGアイコンのみ）
 *  - 画一的右上リンク「〇〇 >」を全廃し、下部アクションボタン「買い物リストを見る (◯件)」へ再構築
 *  - 勤務シフトと連動した献立情報提示
 *  - 0件時は中央スタック配置の Empty State（「献立が未設定です」＋「+ 献立を設定」）
 */

import React from "react";
import { Utensils, ShoppingBag, Plus } from "lucide-react";
import type { Recipe } from "../../types/recipe";
import type { TaskItem, ShiftInfo } from "../../types";

export interface MealShoppingCardProps {
  recipes: Recipe[];
  tasks: TaskItem[];
  currentShift: ShiftInfo;
  onNavigate?: (module: "dashboard" | "tasks" | "lists" | "calendar" | "notes" | "recipes" | "finance") => void;
}

export const MealShoppingCard: React.FC<MealShoppingCardProps> = ({
  recipes,
  tasks,
  currentShift,
  onNavigate,
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

  // シフト連動ラベル
  const shiftSubLabel = currentShift.shiftName
    ? `${currentShift.shiftName}の食事`
    : currentShift.type === "work"
    ? `出勤${currentShift.streakNumber || 1}日目の夕食`
    : `休日${currentShift.streakNumber || 1}日目の食事`;

  return (
    <div
      data-testid="meal-shopping-card"
      className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-xs flex flex-col h-full overflow-hidden border-none transition-all"
      style={{
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.025), 0 1px 3px rgba(0, 0, 0, 0.02)",
      }}
    >
      {/* ─── ヘッダー ─── */}
      <div className="flex items-center justify-between h-7 mb-3 pb-2 border-b border-stone-100 dark:border-stone-800 shrink-0">
        <div className="flex items-center gap-2">
          <Utensils size={16} className="text-amber-700 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-100 tracking-tight">
            今サイクルの献立 ＆ 買い物
          </span>
          <span className="text-xs text-stone-400 dark:text-stone-500 font-medium">
            ({activeRecipes.length})
          </span>
        </div>
      </div>

      {/* ─── 本文（献立リスト または Empty State） ─── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar">
        {displayRecipes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-2">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center mb-1.5">
              <Utensils size={15} className="text-amber-700 dark:text-amber-400" />
            </div>
            <p className="text-xs font-medium text-stone-600 dark:text-stone-300 m-0 mb-2">
              献立が未設定です
            </p>
            <button
              type="button"
              onClick={() => onNavigate?.("recipes")}
              className="appearance-none inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F5F2EB] dark:bg-stone-800 text-[0.72rem] font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-500/15 transition-colors cursor-pointer border-none"
            >
              <Plus size={11} strokeWidth={2.5} />
              <span>献立を設定</span>
            </button>
          </div>
        ) : (
          <div className="space-y-1.5 py-0.5">
            {displayRecipes.map((recipe, idx) => (
              <div
                key={recipe.id}
                onClick={() => onNavigate?.("recipes")}
                className="group flex items-center justify-between p-2 rounded-xl hover:bg-[#F9F7F4] dark:hover:bg-stone-800/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 shrink-0" />
                  <span className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">
                    {recipe.title}
                  </span>
                </div>
                <span className="text-[0.68rem] text-stone-400 dark:text-stone-500 shrink-0 pl-2">
                  {idx === 0 ? shiftSubLabel : "サイクル候補"}
                </span>
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
          className="appearance-none w-full py-2 px-3 rounded-xl bg-[#F5F2EB] dark:bg-stone-800 hover:bg-amber-500/15 dark:hover:bg-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 flex items-center justify-between transition-colors cursor-pointer border-none"
        >
          <div className="flex items-center gap-2">
            <ShoppingBag size={14} className="text-amber-700 dark:text-amber-400" />
            <span>買い物リストを見る</span>
          </div>
          <span className="text-[0.7rem] px-2 py-0.5 rounded-full bg-white dark:bg-stone-700 text-amber-800 dark:text-amber-300 font-bold">
            {shoppingCount}件
          </span>
        </button>
      </div>
    </div>
  );
};
