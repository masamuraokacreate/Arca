/**
 * src/components/dashboard/CycleDayCard.tsx
 * Arca — 4勤2休 サイクルボード各日カード（通常日 / 今日・選択日フォーカス展開）
 *
 * 設計原則 (Core/Rules.md):
 *  - 枠線完全排除（border-none）、微細シャドウ、Apple HIG準拠
 *  - 絵文字完全排除（Lucide React SVGアイコンのみ）
 *  - 天気情報を完全排除し、情報ノイズを削ぎ落としたミニマルな情報設計
 *  - フォーカス日（今日/選択日）: flex-[2] min-w-[280px] に大きく展開
 *    - 日付横に前日・翌日の「＜」「＞」切替ボタンを独立配置
 *    - 予定・ToDoのインライン作業領域を提供
 *  - 通常日: flex-1 min-w-[120px] でコンパクト要約
 *  - 入力フィールド: bg-[#F5F2EB] dark:bg-stone-800 の角丸コンテナ
 */

import React, { useState } from "react";
import {
  Sun,
  Moon,
  Calendar as CalendarIcon,
  CheckSquare,
  CheckCircle2,
  Circle,
  Plus,
} from "lucide-react";
import type { CycleDayInfo } from "../../services/pmCycleService";
import type { CalendarEvent, TaskItem } from "../../types";

export interface CycleDayCardProps {
  day: CycleDayInfo;
  isSelected: boolean;
  events: CalendarEvent[];
  tasks: TaskItem[];
  onClick: () => void;
  onToggleTask: (id: string, current: boolean) => void;
  onAddTask: (title: string, listId?: string, dueDate?: string) => Promise<void> | void;
  onAddEvent: (date: string) => void;
}

export const CycleDayCard: React.FC<CycleDayCardProps> = ({
  day,
  isSelected,
  events,
  tasks,
  onClick,
  onToggleTask,
  onAddTask,
  onAddEvent,
}) => {
  const [taskInput, setTaskInput] = useState("");
  const isWork = day.shift.type === "work";
  const streakNum = day.shift.streakNumber || 1;
  const shiftLabel = day.shift.shiftName
    ? day.shift.shiftName
    : isWork
    ? `出勤 ${streakNum}日目`
    : `休日 ${streakNum}日目`;

  // 未完了タスク数
  const uncompletedTasks = tasks.filter((t) => !t.completed);

  // クイックToDo送信
  const handleQuickAdd = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && taskInput.trim()) {
      e.preventDefault();
      const text = taskInput.trim();
      setTaskInput("");
      await onAddTask(text, "default", day.date);
    }
  };

  // ─── フォーカス状態（選択日 / 今日）: flex-[2] ───
  if (isSelected) {
    return (
      <div
        data-testid={`cycle-day-card-${day.date}`}
        data-selected="true"
        className="flex-[2] min-w-[270px] sm:min-w-[280px] h-full bg-[#FFFDFB] dark:bg-[var(--bg-card-solid)] rounded-2xl p-4 shadow-md ring-1 ring-amber-500/25 flex flex-col transition-all duration-300 ease-out overflow-hidden select-none border-none snap-center"
        style={{
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.03)",
        }}
      >
        {/* ─── ヘッダー: 日付 ＆ 前後日切替「＜ ＞」 ＆ シフトバッジ ─── */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-stone-100 dark:border-stone-700/60 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-stone-800 dark:text-stone-100 tracking-tight">
                {String(day.month).padStart(2, "0")}/{String(day.dayOfMonth).padStart(2, "0")}
              </span>
              <span
                className={`text-xs font-semibold ${
                  day.dayOfWeek === "日"
                    ? "text-rose-500"
                    : day.dayOfWeek === "土"
                    ? "text-sky-600"
                    : "text-stone-500 dark:text-stone-400"
                }`}
              >
                ({day.dayOfWeek})
              </span>
            </div>

            {day.isToday && (
              <span className="text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 leading-none">
                今日
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* シフトバッジ */}
            <span
              className={`inline-flex items-center gap-1 text-[0.7rem] font-semibold px-2 py-0.5 rounded-full leading-tight transition-colors ${
                isWork
                  ? "bg-amber-500/10 text-amber-800 dark:bg-amber-400/25 dark:text-amber-200"
                  : "bg-teal-500/10 text-teal-800 dark:bg-teal-400/25 dark:text-teal-200"
              }`}
            >
              {isWork ? <Sun size={11} className="shrink-0 text-amber-600 dark:text-amber-300" /> : <Moon size={11} className="shrink-0 text-teal-600 dark:text-teal-300" />}
              <span>{shiftLabel}</span>
            </span>
          </div>
        </div>

        {/* ─── 作業領域本文 ─── */}
        <div className="flex-1 flex flex-col min-h-0 pt-2.5">
          {/* 上段: 予定ブロック */}
          <div className="shrink-0 mb-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <CalendarIcon size={13} className="text-amber-700 dark:text-amber-400 shrink-0" />
                <span className="text-xs font-bold text-stone-700 dark:text-stone-300 tracking-tight">
                  予定
                </span>
                <span className="text-[0.68rem] text-stone-400 font-medium">
                  ({events.length})
                </span>
              </div>
              <button
                type="button"
                onClick={() => onAddEvent(day.date)}
                className="appearance-none inline-flex items-center gap-0.5 text-[0.7rem] font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-800 transition-colors cursor-pointer bg-transparent border-none p-0"
              >
                <Plus size={11} strokeWidth={2.5} />
                <span>追加</span>
              </button>
            </div>

            {/* 予定リスト（最大2〜3件スクロール） */}
            <div data-testid="cycle-day-events-list" className="max-h-[72px] overflow-y-auto no-scrollbar space-y-1">
              {events.length === 0 ? (
                <div className="flex items-center justify-between py-1 px-1 text-stone-400 text-[0.72rem]">
                  <span>予定なし</span>
                  <button
                    type="button"
                    onClick={() => onAddEvent(day.date)}
                    className="appearance-none text-[0.68rem] text-stone-500 hover:text-amber-700 transition-colors cursor-pointer bg-transparent border-none p-0"
                  >
                    + 予定を追加
                  </button>
                </div>
              ) : (
                events.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors text-xs"
                  >
                    {e.startTime && (
                      <span className="text-[0.65rem] font-mono font-medium px-1 py-0.2 rounded bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 shrink-0">
                        {e.startTime}
                      </span>
                    )}
                    <span className="text-stone-800 dark:text-stone-200 truncate flex-1">
                      {e.title}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 下段: 今日のToDoブロック */}
          <div className="flex-1 flex flex-col min-h-0 pt-2 border-t border-stone-100 dark:border-stone-700/60">
            <div className="flex items-center justify-between mb-1.5 shrink-0">
              <div className="flex items-center gap-1.5">
                <CheckSquare size={13} className="text-amber-700 dark:text-amber-400 shrink-0" />
                <span className="text-xs font-bold text-stone-700 dark:text-stone-300 tracking-tight">
                  今日のToDo
                </span>
                <span className="text-[0.68rem] text-stone-400 font-medium">
                  ({uncompletedTasks.length})
                </span>
              </div>
            </div>

            {/* ToDoリストスクロール領域 */}
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 pr-0.5">
              {tasks.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[0.72rem] text-stone-400 py-2">
                  タスクはありません
                </div>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className="group/task flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-[#F9F7F4] dark:hover:bg-stone-700/50 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleTask(task.id, task.completed);
                      }}
                      className="appearance-none cursor-pointer bg-transparent border-none p-0 text-stone-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors shrink-0"
                    >
                      {task.completed ? (
                        <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle size={13} />
                      )}
                    </button>
                    <span
                      className={`text-xs truncate transition-all ${
                        task.completed
                          ? "line-through text-stone-400 dark:text-stone-500 opacity-60"
                          : "text-stone-700 dark:text-stone-200"
                      }`}
                    >
                      {task.title}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* クイックToDo入力（背景と同化しない塗り面コンテナ） */}
            <div className="mt-2 shrink-0 bg-[#F5F2EB] dark:bg-white/[0.06] rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 focus-within:bg-white dark:focus-within:bg-[var(--bg-surface)] focus-within:ring-1 focus-within:ring-amber-500/25 transition-all">
              <Plus size={13} className="text-stone-400 shrink-0" />
              <input
                type="text"
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={handleQuickAdd}
                placeholder="ToDoを入力してEnter..."
                className="appearance-none bg-transparent border-none outline-none text-xs w-full text-stone-800 dark:text-stone-100 placeholder:text-stone-400"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── 通常日（他日）: flex-1 min-w-[120px] ───
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`cycle-day-card-${day.date}`}
      data-selected="false"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="flex-1 min-w-[120px] h-full bg-white dark:bg-[var(--bg-card-solid)] rounded-2xl p-3.5 shadow-xs flex flex-col justify-between cursor-pointer hover:bg-stone-50/70 dark:hover:brightness-110 transition-all duration-300 ease-out overflow-hidden select-none outline-none border-none group snap-center"
      style={{
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.025), 0 1px 3px rgba(0, 0, 0, 0.02)",
      }}
    >
      {/* ─── 上段: 日付 ＆ シフト ─── */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-bold text-stone-800 dark:text-stone-100 tracking-tight">
              {String(day.month).padStart(2, "0")}/{String(day.dayOfMonth).padStart(2, "0")}
            </span>
            <span
              className={`text-[0.68rem] font-semibold ${
                day.dayOfWeek === "日"
                  ? "text-rose-500"
                  : day.dayOfWeek === "土"
                  ? "text-sky-600"
                  : "text-stone-400 dark:text-stone-500"
              }`}
            >
              ({day.dayOfWeek})
            </span>
          </div>
          {day.isToday && (
            <span className="text-[0.62rem] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 leading-none">
              今日
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-1 mt-1">
          <span
            className={`inline-flex items-center gap-1 text-[0.68rem] font-semibold px-1.5 py-0.5 rounded-md leading-tight transition-colors ${
              isWork
                ? "bg-amber-500/10 text-amber-800 dark:bg-amber-400/25 dark:text-amber-200"
                : "bg-teal-500/10 text-teal-800 dark:bg-teal-400/25 dark:text-teal-200"
            }`}
          >
            {isWork ? <Sun size={10} className="shrink-0 text-amber-600 dark:text-amber-300" /> : <Moon size={10} className="shrink-0 text-teal-600 dark:text-teal-300" />}
            <span className="truncate">{shiftLabel}</span>
          </span>
        </div>
      </div>

      {/* ─── 中段〜下段: 要約情報（予定・タスク件数） ─── */}
      <div className="flex-1 flex flex-col justify-center gap-1.5 py-2">
        <div className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-300">
          <CalendarIcon size={12} className="text-amber-700/70 dark:text-amber-400 shrink-0" />
          <span className="text-[0.72rem] font-medium truncate">
            {events.length > 0 ? `${events.length}件の予定` : "予定なし"}
          </span>
        </div>
        {events.length > 0 && (
          <p className="text-[0.68rem] text-stone-400 dark:text-stone-500 truncate m-0 pl-4 leading-tight">
            {events[0].title}
          </p>
        )}

        <div className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-300 pt-0.5">
          <CheckSquare size={12} className="text-amber-700/70 dark:text-amber-400 shrink-0" />
          <span className="text-[0.72rem] font-medium truncate">
            {uncompletedTasks.length > 0 ? `${uncompletedTasks.length}件の未完了` : "タスク完了"}
          </span>
        </div>
      </div>

      {/* ─── 最下段: クリック展開の誘導インジケータ ─── */}
      <div className="pt-1.5 border-t border-stone-100 dark:border-stone-800 text-center">
        <span className="text-[0.65rem] text-stone-400 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors font-medium">
          クリックで展開
        </span>
      </div>
    </div>
  );
};
