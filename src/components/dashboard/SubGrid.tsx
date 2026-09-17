/**
 * src/components/dashboard/SubGrid.tsx
 * Arca — ダッシュボード下段サブグリッド（1.5fr : 1fr : 1.2fr 差別化3カラムレイアウト）
 *
 * 設計原則 (Core/Rules.md):
 *  - 機械的な均等分割を廃止し、情報の重要度・操作性に応じた面積配分
 *    - 左 (1.5fr): レシピ
 *    - 中 (1fr): 最近のノート
 *    - 右 (1.2fr): クイックメモ (Scratchpad)
 *  - PC: lg:grid-cols-[1.5fr_1fr_1.2fr] lg:h-[265px]
 *  - モバイル: 縦スタック（grid-cols-1 gap-4）
 */

import React from "react";
import type { Recipe } from "../../types/recipe";
import type { TaskItem, NoteItem, ShiftInfo } from "../../types";
import { MealShoppingCard } from "./MealShoppingCard";
import { RecentNotesCard } from "./RecentNotesCard";
import { QuickMemoCard } from "./QuickMemoCard";

export interface SubGridProps {
  recipes: Recipe[];
  tasks: TaskItem[];
  notes: NoteItem[];
  currentShift: ShiftInfo;
  onNavigate?: (module: "dashboard" | "tasks" | "lists" | "calendar" | "notes" | "recipes" | "finance") => void;
  onSelectNote?: (noteId: string) => void;
  /** レシピIDを渡してレシピ詳細に直接遷移するコールバック */
  onSelectRecipe?: (recipeId: string) => void;
}

export const SubGrid: React.FC<SubGridProps> = ({
  recipes,
  tasks,
  notes,
  currentShift: _currentShift,
  onNavigate,
  onSelectNote,
  onSelectRecipe,
}) => {
  return (
    <div
      data-testid="subgrid-container"
      className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1.2fr] gap-3.5 sm:gap-4 items-stretch lg:h-[265px] pb-4"
    >
      {/* 左カラム (1.5fr): レシピ */}
      <div className="h-[250px] sm:h-[265px] lg:h-full">
        <MealShoppingCard
          recipes={recipes}
          tasks={tasks}
          onNavigate={onNavigate}
          onSelectRecipe={onSelectRecipe}
        />
      </div>

      {/* 中央カラム (1fr): 最近のノート */}
      <div className="h-[250px] sm:h-[265px] lg:h-full">
        <RecentNotesCard
          notes={notes}
          onNavigate={onNavigate}
          onSelectNote={onSelectNote}
        />
      </div>

      {/* 右カラム (1.2fr): クイックメモ */}
      <div className="h-[250px] sm:h-[265px] lg:h-full md:col-span-2 lg:col-span-1">
        <QuickMemoCard />
      </div>
    </div>
  );
};
