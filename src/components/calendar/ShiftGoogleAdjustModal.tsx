/**
 * src/components/calendar/ShiftGoogleAdjustModal.tsx
 * Arca — Google カレンダー連動 4連勤シフト調整モーダル
 *
 * 機能:
 *  - 今サイクル／次サイクルの出勤4日を Googleカレンダーから自動検出
 *  - 日にちごとの個別選択（特定日のみの変更に対応）
 *  - プリセット（5時/5:30/6時/6:30/6:45/日勤）を選んで一括更新
 *  - 「日勤」選択時は開始時間・終了時間を自由に記入可能
 *  - Arca ブランドカラー（マットゴールド #C5A059, セージグリーン #52796F）に準拠した上質なデザイン
 *  - Google 未ログイン時はサインインを促すUI
 *  - Apple HIG準拠、枠線完全排除、多層シャドウ
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, LogIn, CalendarDays, Check, ChevronRight, CheckSquare, Square, Clock } from "lucide-react";
import type { CalendarEvent } from "../../types";
import type { PMSettings } from "../../types/pm";
import {
  calculateFourTwoCycleRange,
  getAdjacentCycleAnchor,
  isWorkEvent,
} from "../../services/pmCycleService";
import { batchUpdateShiftEvents } from "../../services/googleCalendarSync";

// ── シフトプリセット定義 ──
interface ShiftPreset {
  label: string;
  title: string;
  startTime: string;
  endTime: string;
}

const SHIFT_PRESETS: ShiftPreset[] = [
  { label: "5時",     title: "早番(5時)",   startTime: "05:00", endTime: "14:00" },
  { label: "5時30分", title: "早番(5:30)",  startTime: "05:30", endTime: "14:30" },
  { label: "6時",     title: "早番(6時)",   startTime: "06:00", endTime: "15:00" },
  { label: "6時30分", title: "早番(6:30)",  startTime: "06:30", endTime: "15:30" },
  { label: "6時45分", title: "早番(6:45)",  startTime: "06:45", endTime: "15:45" },
  { label: "日勤",    title: "日勤",        startTime: "08:30", endTime: "17:30" },
];

export interface ShiftGoogleAdjustModalProps {
  isOpen: boolean;
  /** 今日の日付 "YYYY-MM-DD" */
  today: string;
  /** Firestoreから取得した全Calendarイベント */
  events: CalendarEvent[];
  /** PMSettings（サイクル計算に使用） */
  pmSettings: PMSettings;
  /** Google Access Token（null=未ログイン） */
  accessToken: string | null;
  /** Google ログイン済みか */
  isGoogleSignedIn: boolean;
  /** Google ログインコールバック */
  onGoogleSignIn: () => void;
  /** モーダルを閉じる */
  onClose: () => void;
  /** 更新完了時のコールバック */
  onDone?: () => void;
}

export function ShiftGoogleAdjustModal({
  isOpen,
  today,
  events,
  pmSettings,
  accessToken,
  isGoogleSignedIn,
  onGoogleSignIn,
  onClose,
  onDone,
}: ShiftGoogleAdjustModalProps) {
  // 「今サイクル」か「次サイクル」か
  const [activeTab, setActiveTab] = useState<"current" | "next">("current");
  // 選択されたプリセット
  const [selectedPreset, setSelectedPreset] = useState<ShiftPreset | null>(null);
  // 日勤用の開始・終了時刻記入用ステート
  const [dayShiftStartTime, setDayShiftStartTime] = useState<string>("08:30");
  const [dayShiftEndTime, setDayShiftEndTime] = useState<string>("17:30");
  // 選択された変更対象の日付配列
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  // 更新ステータス
  const [updateStatus, setUpdateStatus] = useState<"idle" | "updating" | "done" | "error">("idle");

  // 今サイクルの基準日と次サイクルの基準日を計算
  const currentAnchorDate = today;
  const nextAnchorDate = getAdjacentCycleAnchor(today, 1);

  // 選択中タブのサイクル範囲
  const cycleRange = activeTab === "current"
    ? calculateFourTwoCycleRange(currentAnchorDate, events, pmSettings)
    : calculateFourTwoCycleRange(nextAnchorDate, events, pmSettings);

  // 出勤4日の日付を取得
  const workDays = cycleRange.days
    .filter((d) => d.cycleDayType === "work")
    .map((d) => d.date);

  // 各出勤日の既存イベントを取得（タイトル表示用）
  const workDayEvents = workDays.map((date) => ({
    date,
    event: events.find((e) => e.date === date && isWorkEvent(e.title)) ?? null,
  }));

  // サイクルやタブが切り替わった時、出勤日を初期選択（全選択）する
  useEffect(() => {
    setSelectedDates(workDays);
    setSelectedPreset(null);
    setUpdateStatus("idle");
  }, [activeTab, workDays.join(",")]);

  // モーダルが閉じるとリセット
  useEffect(() => {
    if (!isOpen) {
      setActiveTab("current");
      setSelectedPreset(null);
      setDayShiftStartTime("08:30");
      setDayShiftEndTime("17:30");
      setUpdateStatus("idle");
    }
  }, [isOpen]);

  // 日付の選択トグル
  const handleToggleDate = (date: string) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]
    );
  };

  // 全選択 / 全解除
  const handleToggleAllDates = () => {
    if (selectedDates.length === workDays.length) {
      setSelectedDates([]);
    } else {
      setSelectedDates(workDays);
    }
  };

  // 「更新する」ボタンハンドラ
  const handleUpdate = useCallback(async () => {
    if (!selectedPreset || selectedDates.length === 0) return;
    setUpdateStatus("updating");

    const isDayShift = selectedPreset.label === "日勤";
    const finalStartTime = isDayShift ? dayShiftStartTime : selectedPreset.startTime;
    const finalEndTime = isDayShift ? dayShiftEndTime : selectedPreset.endTime;

    try {
      await batchUpdateShiftEvents(
        accessToken ?? null,
        selectedDates,
        {
          title: selectedPreset.title,
          startTime: finalStartTime,
          endTime: finalEndTime,
        },
        events
      );
      setUpdateStatus("done");
      setTimeout(() => {
        onDone?.();
        onClose();
      }, 1500);
    } catch (err) {
      console.error("[ShiftGoogleAdjustModal] 更新失敗:", err);
      setUpdateStatus("error");
    }
  }, [selectedPreset, selectedDates, dayShiftStartTime, dayShiftEndTime, accessToken, events, onDone, onClose]);

  if (!isOpen) return null;

  // 日付を見やすくフォーマット (MM/DD (曜日))
  const formatDate = (dateStr: string): string => {
    const d = new Date(dateStr + "T00:00:00");
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
    const dayName = dayNames[d.getDay()];
    return `${month}/${day}（${dayName}）`;
  };

  const isDayShiftSelected = selectedPreset?.label === "日勤";

  const modalContent = (
    <div
      className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="シフト調整"
    >
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/35 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* モーダル本体 */}
      <div
        className="relative w-full sm:w-[440px] max-h-[92vh] bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{
          boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 20px rgba(0,0,0,0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── ヘッダー ─── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-[#C5A059]" />
            <h2 className="text-base font-bold text-stone-800 dark:text-stone-100 m-0 tracking-tight">
              シフト調整
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="appearance-none p-1.5 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors border-none bg-transparent cursor-pointer"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2 no-scrollbar">
          {/* ─── Google 未ログイン時の警告 ─── */}
          {!isGoogleSignedIn && (
            <div className="mb-3 px-3.5 py-2.5 bg-[#C5A059]/10 dark:bg-[#C5A059]/15 rounded-xl flex items-start gap-2.5">
              <LogIn size={15} className="text-[#C5A059] mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-stone-800 dark:text-stone-200 m-0 mb-0.5">
                  Google アカウントに未接続
                </p>
                <p className="text-[0.68rem] text-stone-500 dark:text-stone-400 m-0 mb-2 leading-tight">
                  接続するとGoogleカレンダーの出勤予定も自動で同期・更新されます
                </p>
                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  className="appearance-none inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#C5A059] hover:bg-[#A8863D] text-white text-[0.72rem] font-semibold cursor-pointer border-none shadow-xs transition-colors"
                >
                  <LogIn size={12} />
                  <span>Google でログイン</span>
                </button>
              </div>
            </div>
          )}

          {/* ─── タブ: 今サイクル / 次サイクル ─── */}
          <div className="flex gap-1.5 p-1 bg-stone-100 dark:bg-stone-800/80 rounded-xl mb-3.5 shrink-0">
            {(["current", "next"] as const).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={[
                    "appearance-none flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border-none",
                    isActive
                      ? "bg-[#C5A059] text-white shadow-xs"
                      : "bg-transparent text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200",
                  ].join(" ")}
                >
                  {tab === "current" ? "今のサイクル" : "次のサイクル"}
                </button>
              );
            })}
          </div>

          {/* ─── 出勤日の一覧（チェックボックス付きで個別選択可能） ─── */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[0.7rem] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider m-0">
                変更する日を選択 ({selectedDates.length}/{workDays.length})
              </p>
              {workDays.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleAllDates}
                  className="appearance-none text-[0.68rem] font-semibold text-[#A8863D] dark:text-[#C5A059] hover:underline cursor-pointer border-none bg-transparent p-0"
                >
                  {selectedDates.length === workDays.length ? "すべて解除" : "すべて選択"}
                </button>
              )}
            </div>

            {workDays.length === 0 ? (
              <p className="text-xs text-stone-400 dark:text-stone-500 py-2">
                出勤日を検出できませんでした
              </p>
            ) : (
              <div className="space-y-1.5">
                {workDayEvents.map(({ date, event }) => {
                  const isChecked = selectedDates.includes(date);
                  return (
                    <div
                      key={date}
                      onClick={() => handleToggleDate(date)}
                      className={[
                        "flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all select-none",
                        isChecked
                          ? "bg-[#C5A059]/10 dark:bg-[#C5A059]/15 ring-1 ring-[#C5A059]/35 text-stone-800 dark:text-stone-100"
                          : "bg-stone-50/70 dark:bg-stone-800/40 text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800/60 opacity-60",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2.5">
                        {isChecked ? (
                          <CheckSquare size={16} className="text-[#C5A059] shrink-0" />
                        ) : (
                          <Square size={16} className="text-stone-300 dark:text-stone-600 shrink-0" />
                        )}
                        <span className="text-xs font-semibold">
                          {formatDate(date)}
                        </span>
                      </div>
                      <span className="text-[0.68rem] text-stone-500 dark:text-stone-400 font-medium truncate max-w-[150px]">
                        {event ? event.title : "予定なし"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── プリセット選択 ─── */}
          <div className="mb-3">
            <p className="text-[0.7rem] font-bold text-stone-500 dark:text-stone-400 mb-2 uppercase tracking-wider m-0">
              変更後のシフトを選択
            </p>
            <div className="grid grid-cols-3 gap-2">
              {SHIFT_PRESETS.map((preset) => {
                const isSelected = selectedPreset?.label === preset.label;
                const timeLabel = preset.label === "日勤"
                  ? `${dayShiftStartTime}〜`
                  : `${preset.startTime}〜`;

                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setSelectedPreset(isSelected ? null : preset)}
                    className={[
                      "appearance-none flex flex-col items-center py-2 px-1 rounded-xl text-xs font-bold cursor-pointer border-none transition-all",
                      isSelected
                        ? "bg-[#C5A059] text-white shadow-sm ring-1 ring-[#C5A059]"
                        : "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-[#C5A059]/15 hover:text-[#A8863D] dark:hover:text-[#C5A059]",
                    ].join(" ")}
                  >
                    <span>{preset.label}</span>
                    <span className={`text-[0.62rem] font-normal mt-0.5 ${isSelected ? "text-white/80" : "text-stone-400 dark:text-stone-500"}`}>
                      {timeLabel}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ─── 日勤選択時の時間帯記入フォーム ─── */}
            {isDayShiftSelected && (
              <div className="mt-2.5 p-3 bg-stone-50 dark:bg-stone-800/60 rounded-xl flex items-center justify-between gap-3 animate-in fade-in duration-150">
                <div className="flex items-center gap-1.5 text-stone-700 dark:text-stone-200">
                  <Clock size={14} className="text-[#C5A059] shrink-0" />
                  <span className="text-xs font-semibold">日勤の時間記入:</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="time"
                    aria-label="日勤の開始時刻"
                    value={dayShiftStartTime}
                    onChange={(e) => setDayShiftStartTime(e.target.value)}
                    className="appearance-none border-none bg-white dark:bg-stone-900 rounded-lg px-2 py-1 text-xs font-semibold text-stone-800 dark:text-stone-100 shadow-xs focus:ring-1 focus:ring-[#C5A059] outline-none"
                  />
                  <span className="text-xs text-stone-400">〜</span>
                  <input
                    type="time"
                    aria-label="日勤の終了時刻"
                    value={dayShiftEndTime}
                    onChange={(e) => setDayShiftEndTime(e.target.value)}
                    className="appearance-none border-none bg-white dark:bg-stone-900 rounded-lg px-2 py-1 text-xs font-semibold text-stone-800 dark:text-stone-100 shadow-xs focus:ring-1 focus:ring-[#C5A059] outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── フッター: 更新ボタン ─── */}
        <div className="px-5 pb-5 pt-3 border-t border-stone-100 dark:border-stone-800 shrink-0 bg-white dark:bg-stone-900">
          {updateStatus === "error" && (
            <p className="text-xs text-red-500 dark:text-red-400 mb-2 text-center">
              更新に失敗しました。再度お試しください。
            </p>
          )}
          <button
            type="button"
            onClick={handleUpdate}
            disabled={!selectedPreset || selectedDates.length === 0 || updateStatus === "updating" || updateStatus === "done"}
            className={[
              "appearance-none w-full py-3 rounded-xl text-sm font-bold transition-all cursor-pointer border-none flex items-center justify-center gap-2",
              updateStatus === "done"
                ? "bg-[#52796F] text-white cursor-not-allowed"
                : !selectedPreset || selectedDates.length === 0
                ? "bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 cursor-not-allowed"
                : "bg-[#C5A059] hover:bg-[#A8863D] text-white shadow-sm",
            ].join(" ")}
          >
            {updateStatus === "done" ? (
              <>
                <Check size={16} />
                <span>更新しました</span>
              </>
            ) : updateStatus === "updating" ? (
              <span>更新中...</span>
            ) : (
              <>
                <span>
                  {selectedDates.length === 0
                    ? "変更する日を選択してください"
                    : selectedPreset
                    ? `「${selectedPreset.label}」で更新する (${selectedDates.length}日分)`
                    : "シフトを選んでください"}
                </span>
                {selectedPreset && selectedDates.length > 0 && <ChevronRight size={16} />}
              </>
            )}
          </button>

          {selectedPreset && selectedDates.length > 0 && updateStatus === "idle" && (
            <p className="text-center text-[0.68rem] text-stone-400 dark:text-stone-500 mt-1.5">
              選択した{selectedDates.length}日分のGoogleカレンダー出勤予定を更新します
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
