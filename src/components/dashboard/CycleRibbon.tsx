/**
 * src/components/dashboard/CycleRibbon.tsx
 * Arca — 4勤2休サイクル・リボン (Cockpit Ribbon)
 *
 * 設計方針 (Core/Rules.md):
 *  - 4勤2休（出勤4日＋休日2日）の1サイクル（6日間）を直感的に俯瞰
 *  - 日付・シフトバッジ（マットゴールド / ソフトセージ）・定期保全（PM）タスク
 *  - 絵文字は一切使用せず、Lucide React SVGアイコンのみを使用
 *  - 境界線（Border）を持たず、微細なシャドウとApple HIG準拠の角丸で統一
 *  - モバイル: overflow-x-auto no-scrollbar snap-x でスワイプ閲覧
 */

import React from "react";
import { Wrench } from "lucide-react";
import type { FourTwoCycleRange, CycleDayInfo } from "../../services/pmCycleService";
import type { PMTemplateItem, PMSettings } from "../../types/pm";
import type { CalendarEvent } from "../../types";
import { getActivePMTasksForDate } from "../../services/pmCycleService";

export interface CycleRibbonProps {
  cycleRange: FourTwoCycleRange;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  pmTemplates: PMTemplateItem[];
  events: CalendarEvent[];
  settings?: PMSettings | null;
  onOpenShiftModal?: () => void;
}

export const CycleRibbon: React.FC<CycleRibbonProps> = ({
  cycleRange,
  selectedDate,
  onSelectDate,
  pmTemplates,
  events,
  settings,
  onOpenShiftModal,
}) => {
  return (
    <div className="w-full mb-6">
      {/* ─── サイクル情報ヘッダー ─── */}
      <div className="flex items-center justify-between px-1 mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[0.72rem] text-charcoal-xlight font-medium">
            {cycleRange.startDate.replace(/-/g, "/")} 〜 {cycleRange.endDate.replace(/-/g, "/")}
          </span>
        </div>
        {onOpenShiftModal && (
          <button
            type="button"
            onClick={onOpenShiftModal}
            className="text-[0.72rem] font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-800 transition-colors cursor-pointer bg-transparent border-none p-0"
          >
            シフト調整
          </button>
        )}
      </div>

      {/* ─── 6分割リボングリッド（PC: 6列 / モバイル: 横スクロール） ─── */}
      <div className="w-full overflow-x-auto no-scrollbar snap-x snap-mandatory py-1 px-0.5">
        <div className="grid grid-flow-col auto-cols-[minmax(140px,1fr)] sm:grid-flow-row sm:grid-cols-6 gap-2.5 min-w-[700px] sm:min-w-0">
          {cycleRange.days.map((day: CycleDayInfo) => {
            const isSelected = day.date === selectedDate;
            const isWork = day.shift.type === "work";

            // 当日のPMタスクを解決
            const pmTasks = getActivePMTasksForDate(day.date, pmTemplates, events, settings);

            // シフトラベルの作成
            const streakNum = day.shift.streakNumber || 1;
            const shiftBadgeText = isWork
              ? `出勤 ${streakNum}日目`
              : `休日 ${streakNum}日目`;
            const shiftNameText = day.shift.shiftName;

            return (
              <div
                key={day.date}
                role="button"
                tabIndex={0}
                onClick={() => onSelectDate(day.date)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectDate(day.date);
                  }
                }}
                className={`group relative flex flex-col justify-between p-3 rounded-2xl cursor-pointer select-none transition-all duration-200 snap-start text-left outline-none border ${
                  day.isToday
                    ? "border-amber-500/50 ring-2 ring-amber-500/25 shadow-sm"
                    : isSelected
                    ? "border-amber-500/40 ring-1.5 ring-amber-500/20"
                    : "border-black/[0.04] dark:border-white/[0.06] hover:translate-y-[-1px]"
                }`}
                style={{
                  background: isSelected
                    ? "var(--bg-card-hover)"
                    : "var(--bg-card)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  boxShadow: isSelected
                    ? "var(--shadow-card-hover)"
                    : "var(--shadow-card)",
                  minHeight: "95px",
                }}
              >
                {/* ── 上段: 日付 ＆ 今日バッジ ── */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-bold tracking-tight text-charcoal">
                        {String(day.month).padStart(2, "0")}/{String(day.dayOfMonth).padStart(2, "0")}
                      </span>
                      <span
                        className={`text-[0.68rem] font-semibold ${
                          day.dayOfWeek === "日"
                            ? "text-rose-500"
                            : day.dayOfWeek === "土"
                            ? "text-sky-600"
                            : "text-charcoal-light"
                        }`}
                      >
                        ({day.dayOfWeek})
                      </span>
                    </div>

                    {day.isToday && (
                      <span className="text-[0.62rem] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white tracking-wide shrink-0 shadow-xs">
                        今日
                      </span>
                    )}
                  </div>

                  {/* ── シフト種別バッジ ── */}
                  <div className="flex flex-wrap items-center gap-1 mb-2">
                    <span
                      className={`text-[0.68rem] font-semibold px-2 py-0.5 rounded-md shrink-0 whitespace-nowrap ${
                        isWork
                          ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                          : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                      }`}
                    >
                      {shiftBadgeText}
                    </span>

                    {shiftNameText && (
                      <span className="text-[0.65rem] text-charcoal-light font-medium truncate max-w-[70px]">
                        {shiftNameText}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── 下段: PMタスク ── */}
                <div className="pt-1 border-t border-black/[0.03] dark:border-white/[0.04]">
                  {pmTasks.length > 0 ? (
                    <div className="flex items-center gap-1">
                      <div
                        className="inline-flex items-center gap-1 text-[0.64rem] font-medium px-1.5 py-0.5 rounded bg-black/[0.035] dark:bg-white/[0.06] text-charcoal-mid truncate max-w-full"
                        title={pmTasks.map((t) => t.title).join(", ")}
                      >
                        <Wrench size={10} className="text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="truncate">{pmTasks[0].title}</span>
                        {pmTasks.length > 1 && (
                          <span className="text-charcoal-xlight shrink-0">+{pmTasks.length - 1}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-4" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
