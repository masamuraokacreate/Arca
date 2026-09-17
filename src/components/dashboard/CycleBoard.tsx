/**
 * src/components/dashboard/CycleBoard.tsx
 * Arca — 4勤2休 サイクルボード（今日フォーカス型アコーディオンFlex構造）
 *
 * 設計原則 (Core/Rules.md):
 *  - 4勤2休の6日間（出勤1〜4日目、休日1〜2日目）を横並びで俯瞰
 *  - 選択日（今日）が flex-[2] に約2倍横幅展開し、他日は flex-1 で要約表示
 *  - モバイル: overflow-x-auto snap-x no-scrollbar による横スワイプスナップ
 *  - 天気情報を完全排除し、生活リズムと行動の連動に特化
 *  - 絵文字完全排除（Lucide React SVGアイコンのみ）
 */

import React, { useEffect, useRef, useCallback } from "react";
import type { FourTwoCycleRange } from "../../services/pmCycleService";
import type { CalendarEvent, TaskItem } from "../../types";
import { CycleDayCard } from "./CycleDayCard";

export interface CycleBoardProps {
  cycleRange: FourTwoCycleRange;
  selectedDate: string;
  today?: string;
  onSelectDate: (date: string) => void;
  events: CalendarEvent[];
  tasks: TaskItem[];
  onToggleTask: (id: string, current: boolean) => void;
  onAddTask: (title: string, listId?: string, dueDate?: string) => Promise<void> | void;
  onAddEvent: (date: string) => void;
}

export const CycleBoard: React.FC<CycleBoardProps> = ({
  cycleRange,
  selectedDate,
  today,
  onSelectDate,
  events,
  tasks,
  onToggleTask,
  onAddTask,
  onAddEvent,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // iPhone / モバイル表示時に「今日」（または選択日）カードをコンテナの中央（センター）へスクロール
  const scrollToCenter = useCallback((smooth = true) => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    if (window.innerWidth >= 768) return;

    // サイクル内に今日が含まれる場合は今日、それ以外は選択日を対象
    const targetDate = today && cycleRange.days.some((d) => d.date === today)
      ? today
      : selectedDate;

    const targetCard = container.querySelector(
      `[data-testid="cycle-day-card-${targetDate}"]`
    ) as HTMLElement | null;

    if (targetCard) {
      const cardLeft = targetCard.offsetLeft;
      const cardWidth = targetCard.offsetWidth;
      const containerWidth = container.clientWidth;
      const targetScrollLeft = cardLeft - (containerWidth / 2) + (cardWidth / 2);

      container.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: smooth ? "smooth" : "auto",
      });
    }
  }, [today, cycleRange, selectedDate]);

  // 初期マウント時および対象日・サイクル変更時にセンタリングを実行
  useEffect(() => {
    // 1. 即時
    scrollToCenter(false);

    // 2. 次フレーム（レイアウト計算後）
    const rafId = requestAnimationFrame(() => {
      scrollToCenter(false);
    });

    // 3. 遅延追従（フォント・SVG展開完了後）
    const t1 = setTimeout(() => scrollToCenter(true), 80);
    const t2 = setTimeout(() => scrollToCenter(true), 250);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [scrollToCenter]);

  return (
    <div className="w-full mb-8">
      {/* ─── 4勤2休 6日間アコーディオンコンテナ ─── */}
      <div
        ref={containerRef}
        data-testid="cycle-board-container"
        className="w-full flex gap-4 h-[330px] overflow-x-auto sm:overflow-hidden snap-x snap-mandatory no-scrollbar py-1 px-6 sm:px-0.5"
        style={{ scrollPadding: "0 1.5rem" }}
      >
        {cycleRange.days.map((day) => {
          const isSelected = day.date === selectedDate;

          // この日の予定（isShiftOnly を除外）
          const dayEvents = events
            .filter((e) => e.date === day.date && !e.isShiftOnly)
            .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));

          // この日のタスク（dueDate === day.date）
          const dayTasks = tasks.filter((t) => t.dueDate === day.date);

          return (
            <CycleDayCard
              key={day.date}
              day={day}
              isSelected={isSelected}
              events={dayEvents}
              tasks={dayTasks}
              onClick={() => onSelectDate(day.date)}
              onToggleTask={onToggleTask}
              onAddTask={onAddTask}
              onAddEvent={onAddEvent}
            />
          );
        })}
      </div>
    </div>
  );
};
