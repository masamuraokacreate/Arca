/**
 * src/components/dashboard/DashboardTasksCard.tsx
 * Arca — ダッシュボード用タスク一覧カード
 *
 * 設計原則 (Core/Rules.md):
 *  - 未完了タスクを期日昇順（期限切れ・今日・直近・期限なし）で一覧表示
 *  - インラインでの完了トグル（Circle / CheckCircle2）
 *  - クイック追加入力バー
 *  - 右上に「Tasks」モジュールへのナビゲーションリンク
 *  - Apple HIG準拠の余白、微細シャドウ、絵文字完全排除
 */

import React, { useState } from "react";
import {
  CheckSquare,
  CheckCircle2,
  Circle,
  Plus,
  ChevronRight,
} from "lucide-react";
import type { TaskItem } from "../../types";
import type { FourTwoCycleRange } from "../../services/pmCycleService";

export interface DashboardTasksCardProps {
  tasks: TaskItem[];
  cycleRange?: FourTwoCycleRange;
  selectedDate?: string;
  onToggleTask?: (id: string, completed: boolean) => void;
  onAddTask?: (title: string, listId?: string, dueDate?: string) => Promise<void> | void;
  onNavigate?: (module: "dashboard" | "tasks" | "lists" | "calendar" | "notes" | "recipes" | "finance") => void;
}

export const DashboardTasksCard: React.FC<DashboardTasksCardProps> = ({
  tasks,
  cycleRange,
  selectedDate: _selectedDate,
  onToggleTask,
  onAddTask,
  onNavigate,
}) => {
  const [quickTitle, setQuickTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);
  const cycleDates = new Set(cycleRange?.days.map((d) => d.date) || []);
  const hasToday = cycleRange ? cycleRange.days.some((d) => d.isToday) : true;

  // デイカードに表示されていない「マイタスク」（期限が今サイクル外のタスク、または期限なしタスク）
  const otherTasks = tasks
    .filter((t) => {
      if (t.completed) return false;
      // マイタスク（defaultリストまたはlistId未設定）のみ
      if (t.listId && t.listId !== "default") return false;
      // デイカードに表示される条件（今サイクル内の期日、または今日における過去の期限超過タスク）に該当するタスクを除外
      if (t.dueDate && cycleDates.has(t.dueDate)) return false;
      if (hasToday && t.dueDate && t.dueDate < todayStr) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

  const displayTasks = otherTasks.slice(0, 8);

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      // 今サイクルの翌日以降（次シフト以降の期日）を設定
      const lastCycleDate = cycleRange?.days[cycleRange.days.length - 1]?.date;
      let nextShiftDate = "";
      if (lastCycleDate) {
        const d = new Date(lastCycleDate);
        d.setDate(d.getDate() + 1);
        nextShiftDate = d.toISOString().slice(0, 10);
      }
      await onAddTask?.(quickTitle.trim(), "default", nextShiftDate || undefined);
      setQuickTitle("");
    } catch (err) {
      console.error("Failed to quick add task:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="dashboard-tasks-card"
      className="arca-surface-card bg-white dark:bg-[var(--bg-card-solid)] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col h-full overflow-hidden border-none transition-all"
      style={{
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.025), 0 1px 3px rgba(0, 0, 0, 0.02)",
      }}
    >
      {/* ─── ヘッダー ─── */}
      <div className="flex items-center justify-between h-7 mb-3 pb-2 border-b border-stone-100 dark:border-stone-700/60 shrink-0">
        <div className="flex items-center gap-2">
          <CheckSquare size={16} className="text-amber-700 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-100 tracking-tight">
            その他のタスク
          </span>
          <span className="text-xs font-semibold text-stone-400 dark:text-stone-400">
            ({otherTasks.length})
          </span>
        </div>

        <button
          type="button"
          aria-label="タスク一覧を開く"
          onClick={() => onNavigate?.("tasks")}
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-stone-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors cursor-pointer bg-transparent border-none p-0"
        >
          <span>すべて見る</span>
          <ChevronRight size={13} strokeWidth={2.5} />
        </button>
      </div>

      {/* ─── タスク一覧スクロール領域 ─── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar pr-0.5">
        {displayTasks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center my-auto py-3 text-center">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 dark:bg-emerald-400/15 flex items-center justify-center mb-1.5">
              <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-xs font-medium text-stone-600 dark:text-stone-300 mb-0.5">
              その他のタスクはありません
            </p>
            <p className="text-[0.68rem] text-stone-400 dark:text-stone-500 m-0">
              下の入力欄から新しいタスクを追加できます
            </p>
          </div>
        ) : (
          <ul className="list-none m-0 p-0 space-y-1.5">
            {displayTasks.map((t) => {
              const isOverdue = t.dueDate ? t.dueDate < todayStr : false;
              const isDueToday = t.dueDate === todayStr;

              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-[#F9F7F4] dark:hover:bg-white/[0.04] transition-colors group/item"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleTask?.(t.id, t.completed);
                      }}
                      className="bg-transparent border-none p-0 cursor-pointer text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors shrink-0"
                      title={t.completed ? "未完了に戻す" : "完了にする"}
                    >
                      {t.completed ? (
                        <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle size={15} />
                      )}
                    </button>

                    <span
                      className={`text-xs truncate font-medium ${
                        t.completed
                          ? "line-through text-stone-400 dark:text-stone-500"
                          : "text-stone-800 dark:text-stone-100"
                      }`}
                    >
                      {t.title}
                    </span>
                  </div>

                  {t.dueDate && (
                    <span
                      className={`text-[0.65rem] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                        isOverdue
                          ? "bg-rose-50 text-rose-700 dark:bg-rose-400/20 dark:text-rose-300"
                          : isDueToday
                          ? "bg-amber-500/15 text-amber-800 dark:bg-amber-400/25 dark:text-amber-200"
                          : "bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-stone-300"
                      }`}
                    >
                      {isDueToday
                        ? "今日"
                        : t.dueDate.slice(5).replace("-", "/")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ─── インラインクイック追加 ─── */}
      <form onSubmit={handleQuickAddSubmit} className="mt-2.5 pt-2 border-t border-stone-100 dark:border-stone-700/50 shrink-0">
        <div className="bg-[#F5F2EB] dark:bg-white/[0.06] rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 focus-within:bg-white dark:focus-within:bg-[var(--bg-surface)] focus-within:ring-1 focus-within:ring-amber-500/25 transition-all">
          <Plus size={13} className="text-stone-400 shrink-0" />
          <input
            type="text"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            disabled={isSubmitting}
            placeholder="その他のタスクを入力してEnter..."
            className="appearance-none bg-transparent border-none outline-none text-xs w-full text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500"
          />
        </div>
      </form>
    </div>
  );
};
