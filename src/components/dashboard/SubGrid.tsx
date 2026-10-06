/**
 * src/components/dashboard/SubGrid.tsx
 * Arca — ダッシュボード下段サブグリッド（タスク・レシピ・ノート・クイックメモ 4カラムレイアウト）
 *
 * 設計原則 (Core/Rules.md):
 *  - ダッシュボード司令塔として、主要アクション（タスク・献立レシピ・ノート・メモ）を俯瞰
 *    - カラム1: タスク（ToDo一覧 & クイック追加）
 *    - カラム2: 献立・買い物
 *    - カラム3: 最近のノート
 *    - カラム4: クイックメモ (Scratchpad)
 *  - PC: lg:grid-cols-4 lg:h-[275px]
 *  - モバイル: 縦スタック（grid-cols-1 gap-4）
 */

import React from "react";
import type { Recipe } from "../../types/recipe";
import type { TaskItem, NoteItem, ShiftInfo } from "../../types";
import type { FourTwoCycleRange } from "../../services/pmCycleService";
import { DashboardTasksCard } from "./DashboardTasksCard";
import { MealShoppingCard } from "./MealShoppingCard";
import { RecentNotesCard } from "./RecentNotesCard";
import { QuickMemoCard } from "./QuickMemoCard";

export interface SubGridProps {
  recipes: Recipe[];
  tasks: TaskItem[];
  notes: NoteItem[];
  currentShift: ShiftInfo;
  cycleRange?: FourTwoCycleRange;
  onToggleTask?: (id: string, completed: boolean) => void;
  onAddTask?: (title: string, listId?: string, dueDate?: string) => Promise<void> | void;
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
  cycleRange,
  onToggleTask,
  onAddTask,
  onNavigate,
  onSelectNote,
  onSelectRecipe,
}) => {
  return (
    <div
      data-testid="subgrid-container"
      className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 items-stretch lg:h-[275px] pb-4"
    >
      {/* カラム1: タスク */}
      <div className="h-[250px] sm:h-[275px] lg:h-full">
        <DashboardTasksCard
          tasks={tasks}
          cycleRange={cycleRange}
          onToggleTask={onToggleTask}
          onAddTask={onAddTask}
          onNavigate={onNavigate}
        />
      </div>

      {/* カラム2: レシピ */}
      <div className="h-[250px] sm:h-[275px] lg:h-full">
        <MealShoppingCard
          recipes={recipes}
          tasks={tasks}
          onNavigate={onNavigate}
          onSelectRecipe={onSelectRecipe}
        />
      </div>

      {/* カラム3: 最近のノート */}
      <div className="h-[250px] sm:h-[275px] lg:h-full">
        <RecentNotesCard
          notes={notes}
          onNavigate={onNavigate}
          onSelectNote={onSelectNote}
        />
      </div>

      {/* カラム4: クイックメモ */}
      <div className="h-[250px] sm:h-[275px] lg:h-full">
        <QuickMemoCard />
      </div>
    </div>
  );
};
