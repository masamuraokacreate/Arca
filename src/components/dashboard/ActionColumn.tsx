/**
 * src/components/dashboard/ActionColumn.tsx
 * Arca — Dashboard Column 1: アクション（行動）
 *
 * 構成:
 *  1. 直近・今サイクルの予定 (Calendar Widget) & 予定追加ポップアップモーダル導線
 *  2. 期限が今サイクルのタスク (Tasks Widget)
 *  3. インライン・タスク追加 (Quick Add)
 *
 * 設計方針 (Core/Rules.md):
 *  - 否定的表現（「ありません」）の全廃と前向きなフィードバック
 *  - 絵文字完全排除（Lucide React SVGアイコンのみ）
 *  - 枠線完全排除、微細二重シャドウ、Apple HIG準拠の角丸・余白
 */

import React, { useState, useCallback } from "react";
import {
  Calendar as CalendarIcon,
  CheckSquare,
  CheckCircle2,
  Circle,
  Plus,
  ChevronRight,
} from "lucide-react";
import type { CalendarEvent, TaskItem, TaskListCategory } from "../../types";
import type { FourTwoCycleRange } from "../../services/pmCycleService";
import { ListIcon } from "../common/ListIcon";

// ─────────────────────────────────────────
// 1. 今サイクルの予定カード (CycleEventsCard) - 上段 210px
// ─────────────────────────────────────────

export interface CycleEventsCardProps {
  cycleRange: FourTwoCycleRange;
  events: CalendarEvent[];
  onNavigate?: (module: "dashboard" | "tasks" | "lists" | "calendar" | "notes" | "recipes" | "finance") => void;
  onAddEvent?: () => void;
}

export const CycleEventsCard: React.FC<CycleEventsCardProps> = ({
  cycleRange,
  events,
  onNavigate,
  onAddEvent,
}) => {
  // サイクル期間内の有効な予定（isShiftOnly 除外）を抽出
  const cycleEvents = events
    .filter((e) => {
      if (e.isShiftOnly) return false;
      return e.date >= cycleRange.startDate && e.date <= cycleRange.endDate;
    })
    .sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return (a.startTime || "").localeCompare(b.startTime || "");
    });

  const displayEvents = cycleEvents.slice(0, 5);

  return (
    <div
      data-testid="cycle-events-card"
      className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-xs flex flex-col h-full overflow-hidden border-none"
    >
      {/* ─── ヘッダー (h-7, 下線で水平基準線を明示) ─── */}
      <div className="flex items-center justify-between h-7 mb-3.5 pb-2 border-b border-stone-100 dark:border-stone-800 shrink-0">
        <div className="flex items-center gap-2">
          <CalendarIcon size={16} className="text-amber-700 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-100 tracking-tight">
            今サイクルの予定
          </span>
          <span className="text-xs text-stone-400 dark:text-stone-500 font-medium">
            ({cycleEvents.length})
          </span>
        </div>

        <button
          type="button"
          onClick={() => onNavigate?.("calendar")}
          className="flex items-center gap-1 text-xs text-stone-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors cursor-pointer bg-transparent border-none p-0"
        >
          <span>Calendar</span>
          <ChevronRight size={13} strokeWidth={2.5} />
        </button>
      </div>

      {/* ─── カード本文 (flex-1 overflow-y-auto no-scrollbar) ─── */}
      <div data-testid="cycle-events-list" className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar pr-0.5">
        {displayEvents.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-2">
            <p className="text-xs text-stone-400 dark:text-stone-500 m-0">
              今サイクルの予定はありません
            </p>
          </div>
        ) : (
          <ul className="list-none m-0 p-0 space-y-2">
            {displayEvents.map((e) => {
              const [_, m, d] = e.date.split("-");
              return (
                <li
                  key={e.id}
                  onClick={() => onNavigate?.("calendar")}
                  className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors cursor-pointer"
                >
                  <span className="text-[0.68rem] font-bold text-stone-400 dark:text-stone-500 w-9 shrink-0 text-center">
                    {m}/{d}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-stone-800 dark:text-stone-100 truncate m-0">
                      {e.title}
                    </p>
                  </div>
                  {e.startTime && (
                    <span className="text-[0.68rem] font-medium text-amber-700 dark:text-amber-400 shrink-0">
                      {e.startTime}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ─── フッター (mt-auto 最下部吸着) ─── */}
      <div className="mt-auto pt-2.5 shrink-0 flex items-center justify-end">
        <button
          type="button"
          onClick={() => {
            if (onAddEvent) {
              onAddEvent();
            } else {
              onNavigate?.("calendar");
            }
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 transition-all cursor-pointer border-none shadow-2xs"
          title="予定を追加"
        >
          <Plus size={13} strokeWidth={2.5} />
          <span>予定を登録</span>
        </button>
      </div>
    </div>
  );
};


// ─────────────────────────────────────────
// 2. 期限が今サイクルのタスク (UpcomingTasksCard) - 下段 240px
// ─────────────────────────────────────────

export interface UpcomingTasksCardProps {
  cycleRange: FourTwoCycleRange;
  tasks: TaskItem[];
  taskLists: TaskListCategory[];
  selectedDate: string;
  onToggleTask: (id: string, completed: boolean) => void;
  onAddTask: (title: string, listId?: string, dueDate?: string) => Promise<void>;
  onNavigate?: (module: "dashboard" | "tasks" | "lists" | "calendar" | "notes" | "recipes" | "finance") => void;
}

export const UpcomingTasksCard: React.FC<UpcomingTasksCardProps> = ({
  cycleRange,
  tasks,
  taskLists,
  selectedDate,
  onToggleTask,
  onAddTask,
  onNavigate,
}) => {
  const [quickTitle, setQuickTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 期限が近い未完了タスク（サイクル期間内または直近7日以内、期日超過含む）
  const now = new Date();
  const nextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const nextWeekStr = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, "0")}-${String(nextWeek.getDate()).padStart(2, "0")}`;
  const maxDueDate = cycleRange.endDate > nextWeekStr ? cycleRange.endDate : nextWeekStr;

  const upcomingCycleTasks = tasks
    .filter((t) => {
      if (t.completed) return false;
      if (!t.dueDate) return false;
      return t.dueDate <= maxDueDate;
    })
    .sort((a, b) => {
      const dateA = a.dueDate || "9999-99-99";
      const dateB = b.dueDate || "9999-99-99";
      return dateA.localeCompare(dateB);
    });

  const displayTasks = upcomingCycleTasks.slice(0, 6);

  const getGroupInfo = useCallback(
    (listId?: string) => {
      const found = taskLists.find((l) => l.id === listId);
      return {
        title: found?.title || "Inbox",
        icon: found?.icon || "inbox",
      };
    },
    [taskLists]
  );

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onAddTask(quickTitle.trim(), undefined, selectedDate);
      setQuickTitle("");
    } catch (err) {
      console.error("Failed to quick add task:", err);
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
          <CheckSquare size={16} className="text-amber-700 dark:text-amber-400" />
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-100 tracking-tight">
            期限の近いタスク
          </span>
          <span className="text-xs font-medium text-stone-600 dark:text-stone-400">
            ({upcomingCycleTasks.length})
          </span>
        </div>

        <button
          type="button"
          aria-label="Tasks"
          onClick={() => onNavigate?.("tasks")}
          className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-amber-700 dark:hover:text-amber-400 transition-colors cursor-pointer bg-transparent border-none p-0"
        >
          <span>Tasks</span>
          <ChevronRight size={13} strokeWidth={2.5} />
        </button>
      </div>

      {/* ─── 本文スクロール領域 ─── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar pr-0.5">
        {displayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center my-auto py-2 text-center">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
              <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-xs font-medium text-stone-700 dark:text-stone-200 mb-0.5">
              今サイクルのタスクはすべて完了しています
            </p>
            <p className="text-[0.7rem] text-stone-600 dark:text-stone-400">
              新しいタスクがあれば下から登録できます
            </p>
          </div>
        ) : (
          <ul className="list-none m-0 p-0 space-y-1.5">
            {displayTasks.map((t) => {
              const group = getGroupInfo(t.listId);
              const isOverdue = t.dueDate ? t.dueDate < selectedDate : false;

              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2.5 p-1.5 rounded-xl hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleTask(t.id, t.completed);
                      }}
                      className="bg-transparent border-none p-0 cursor-pointer text-stone-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors shrink-0"
                      title={t.completed ? "未完了に戻す" : "完了にする"}
                    >
                      {t.completed ? (
                        <CheckCircle2 size={16} className="text-amber-600" />
                      ) : (
                        <Circle size={16} />
                      )}
                    </button>

                    <span
                      className={`text-xs truncate font-medium ${
                        t.completed
                          ? "line-through text-stone-400 dark:text-stone-500"
                          : "text-stone-700 dark:text-stone-200"
                      }`}
                    >
                      {t.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {t.dueDate && (
                      <span
                        className={`text-[0.65rem] font-semibold px-1.5 py-0.5 rounded ${
                          isOverdue
                            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                            : "bg-black/[0.04] dark:bg-white/[0.06] text-stone-500 dark:text-stone-400"
                        }`}
                      >
                        {t.dueDate.slice(5).replace("-", "/")}
                      </span>
                    )}

                    <div className="inline-flex items-center gap-1 text-[0.65rem] text-stone-400 dark:text-stone-500 bg-black/[0.03] dark:bg-white/[0.05] px-1.5 py-0.5 rounded max-w-[80px] truncate">
                      <ListIcon icon={group.icon} size="0.65rem" />
                      <span className="truncate">{group.title}</span>
                    </div>
                  </div>
                </li>
              );
            })}
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
              placeholder="タスクをクイック追加 (Enterで登録)..."
              disabled={isSubmitting}
              className="w-full bg-transparent border-none outline-none text-xs text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 appearance-none"
            />
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────
// 後方互換用 ActionColumn コンポーネント
// ─────────────────────────────────────────

export interface ActionColumnProps extends CycleEventsCardProps, UpcomingTasksCardProps {}

export const ActionColumn: React.FC<ActionColumnProps> = (props) => {
  return (
    <div className="flex flex-col gap-5">
      <CycleEventsCard
        cycleRange={props.cycleRange}
        events={props.events}
        onNavigate={props.onNavigate}
        onAddEvent={props.onAddEvent}
      />
      <UpcomingTasksCard
        cycleRange={props.cycleRange}
        tasks={props.tasks}
        taskLists={props.taskLists}
        selectedDate={props.selectedDate}
        onToggleTask={props.onToggleTask}
        onAddTask={props.onAddTask}
        onNavigate={props.onNavigate}
      />
    </div>
  );
};

