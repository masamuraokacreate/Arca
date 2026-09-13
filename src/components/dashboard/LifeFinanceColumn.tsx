/**
 * src/components/dashboard/LifeFinanceColumn.tsx
 * Arca — Dashboard Column 2: ライフ・生活基盤（今サイクルの献立 & 買い物リスト）
 *
 * 構成:
 *  1. 今サイクルの献立 (CycleMenuCard) - 上段 210px
 *  2. 買い物リスト (ShoppingListCard) - 下段 240px
 *
 * 設計方針 (Core/Rules.md):
 *  - 枠線完全排除、微細二重シャドウ、Apple HIG準拠の角丸・余白
 *  - 絵文字完全排除（Lucide React SVGアイコンのみ）
 *  - 前向きなフィードバック表現
 */

import React, { useState } from "react";
import {
  UtensilsCrossed,
  ShoppingCart,
  ChevronRight,
  Star,
  Plus,
  CheckCircle2,
  Circle,
} from "lucide-react";
import type { Recipe } from "../../types/recipe";
import type { TaskItem } from "../../types";

// ─────────────────────────────────────────
// 1. 今サイクルの献立カード (CycleMenuCard) - 上段 210px
// ─────────────────────────────────────────

export interface CycleMenuCardProps {
  recipes: Recipe[];
  onNavigate?: (module: "dashboard" | "tasks" | "lists" | "calendar" | "notes" | "recipes" | "finance") => void;
}

export const CycleMenuCard: React.FC<CycleMenuCardProps> = ({
  recipes,
  onNavigate,
}) => {
  const activeRecipes = recipes.filter((r) => !r.isDeleted);
  const cycleRecipes = [...activeRecipes]
    .sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return b.updatedAt - a.updatedAt;
    })
    .slice(0, 3);

  return (
    <div
      className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-xs flex flex-col h-full overflow-hidden border-none"
      style={{
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.025), 0 1px 3px rgba(0, 0, 0, 0.02)",
      }}
    >
      {/* ─── ヘッダー (h-7 / 28px) ─── */}
      <div className="flex items-center justify-between h-7 mb-3.5 pb-2 border-b border-stone-100 dark:border-stone-800 shrink-0">
        <div className="flex items-center gap-2">
          <UtensilsCrossed size={16} className="text-amber-700 dark:text-amber-400" />
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-100 tracking-tight">
            今サイクルの献立
          </span>
          <span className="text-xs font-medium text-stone-600 dark:text-stone-400">
            ({activeRecipes.length})
          </span>
        </div>

        <button
          type="button"
          aria-label="Recipes"
          onClick={() => onNavigate?.("recipes")}
          className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-amber-700 dark:hover:text-amber-400 transition-colors cursor-pointer bg-transparent border-none p-0"
        >
          <span>Recipes</span>
          <ChevronRight size={13} strokeWidth={2.5} />
        </button>
      </div>

      {/* ─── 本文スクロール領域 ─── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar pr-0.5">
        {cycleRecipes.length === 0 ? (
          <div className="flex flex-col items-center justify-center my-auto py-2 text-center">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
              <UtensilsCrossed size={16} className="text-amber-700 dark:text-amber-400" />
            </div>
            <p className="text-xs font-medium text-stone-700 dark:text-stone-200 mb-0.5">
              献立・レシピを登録してみましょう
            </p>
            <p className="text-[0.7rem] text-stone-600 dark:text-stone-400">
              お気に入りの料理や今夜の候補をストックできます
            </p>
          </div>
        ) : (
          <ul className="list-none m-0 p-0 space-y-2">
            {cycleRecipes.map((recipe) => (
              <li
                key={recipe.id}
                onClick={() => onNavigate?.("recipes")}
                className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
              >
                {/* サムネイル */}
                <div className="w-8 h-8 rounded-lg overflow-hidden bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                  {recipe.imageUrl ? (
                    <img
                      src={recipe.imageUrl}
                      alt={recipe.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UtensilsCrossed size={14} className="text-stone-400 dark:text-stone-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    {recipe.favorite && (
                      <Star size={11} className="text-amber-500 fill-amber-500 shrink-0" />
                    )}
                    <p className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate m-0">
                      {recipe.title}
                    </p>
                  </div>

                  {recipe.ingredients && recipe.ingredients.length > 0 && (
                    <p className="text-[0.68rem] text-stone-600 dark:text-stone-400 truncate mt-0.5 m-0">
                      {recipe.ingredients.slice(0, 3).map((i) => i.name).join(" / ")}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─── フッター (mt-auto 最下部吸着) ─── */}
      <div className="mt-auto pt-2.5 shrink-0 flex items-center justify-end">
        <button
          type="button"
          onClick={() => onNavigate?.("recipes")}
          className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300 hover:text-amber-900 transition-colors cursor-pointer bg-transparent border-none p-0"
        >
          <span>レシピ一覧を見る</span>
          <ChevronRight size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────
// 2. 買い物リストカード (ShoppingListCard) - 下段 240px
// ─────────────────────────────────────────

export interface ShoppingListCardProps {
  tasks: TaskItem[];
  onToggleTask?: (id: string, completed: boolean) => void;
  onAddTask?: (title: string, listId?: string, dueDate?: string) => Promise<void>;
  onNavigate?: (module: "dashboard" | "tasks" | "lists" | "calendar" | "notes" | "recipes" | "finance") => void;
}

export const ShoppingListCard: React.FC<ShoppingListCardProps> = ({
  tasks,
  onToggleTask,
  onAddTask,
  onNavigate,
}) => {
  const [quickTitle, setQuickTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 買い物リストに属するタスク（未購入優先）
  const shoppingTasks = tasks.filter((t) => t.listId === "shopping");
  const uncompletedItems = shoppingTasks.filter((t) => !t.completed);
  const displayItems = uncompletedItems.slice(0, 4);

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim() || isSubmitting || !onAddTask) return;

    try {
      setIsSubmitting(true);
      await onAddTask(quickTitle.trim(), "shopping");
      setQuickTitle("");
    } catch (err) {
      console.error("Failed to add shopping item:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-xs flex flex-col h-full overflow-hidden border-none"
      style={{
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.025), 0 1px 3px rgba(0, 0, 0, 0.02)",
      }}
    >
      {/* ─── ヘッダー (h-7 / 28px) ─── */}
      <div className="flex items-center justify-between h-7 mb-3.5 pb-2 border-b border-stone-100 dark:border-stone-800 shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart size={16} className="text-amber-700 dark:text-amber-400" />
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-100 tracking-tight">
            買い物リスト
          </span>
          <span className="text-xs font-medium text-stone-600 dark:text-stone-400">
            ({uncompletedItems.length})
          </span>
        </div>

        <button
          type="button"
          aria-label="Lists"
          onClick={() => onNavigate?.("lists")}
          className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-amber-700 dark:hover:text-amber-400 transition-colors cursor-pointer bg-transparent border-none p-0"
        >
          <span>Lists</span>
          <ChevronRight size={13} strokeWidth={2.5} />
        </button>
      </div>

      {/* ─── 本文スクロール領域 ─── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar pr-0.5">
        {displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center my-auto py-2 text-center">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
              <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-xs font-medium text-stone-700 dark:text-stone-200 mb-0.5">
              必要な食材・日用品は揃っています
            </p>
            <p className="text-[0.7rem] text-stone-600 dark:text-stone-400">
              買い足すものがあれば下から素早く登録できます
            </p>
          </div>
        ) : (
          <ul className="list-none m-0 p-0 space-y-1.5">
            {displayItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2.5 p-1.5 rounded-xl hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTask?.(item.id, item.completed);
                    }}
                    className="bg-transparent border-none p-0 cursor-pointer text-stone-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors shrink-0"
                    title={item.completed ? "未購入に戻す" : "購入済みにする"}
                  >
                    {item.completed ? (
                      <CheckCircle2 size={16} className="text-amber-600" />
                    ) : (
                      <Circle size={16} />
                    )}
                  </button>

                  <span
                    className={`text-xs truncate font-medium ${
                      item.completed
                        ? "line-through text-stone-400 dark:text-stone-500"
                        : "text-stone-700 dark:text-stone-200"
                    }`}
                  >
                    {item.title}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─── フッター (mt-auto 最下部吸着) ─── */}
      <div className="mt-auto pt-2.5 shrink-0">
        <form onSubmit={handleQuickAddSubmit}>
          <div className="flex items-center gap-2 bg-black/[0.025] dark:bg-white/[0.04] px-3 py-1.5 rounded-xl">
            <Plus size={14} className="text-stone-400 dark:text-stone-500 shrink-0" />
            <input
              type="text"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="買うものを追加 (Enterで登録)..."
              disabled={isSubmitting || !onAddTask}
              className="w-full bg-transparent border-none outline-none text-xs text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 appearance-none"
            />
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────
// 後方互換用 LifeFinanceColumn コンポーネント
// ─────────────────────────────────────────

export interface LifeFinanceColumnProps extends CycleMenuCardProps, ShoppingListCardProps {}

export const LifeFinanceColumn: React.FC<LifeFinanceColumnProps> = (props) => {
  return (
    <div className="flex flex-col gap-5">
      <CycleMenuCard recipes={props.recipes} onNavigate={props.onNavigate} />
      <ShoppingListCard
        tasks={props.tasks}
        onToggleTask={props.onToggleTask}
        onAddTask={props.onAddTask}
        onNavigate={props.onNavigate}
      />
    </div>
  );
};

