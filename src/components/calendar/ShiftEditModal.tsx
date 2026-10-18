/**
 * src/components/calendar/ShiftEditModal.tsx
 * Arca — 4連勤ワンシフト一括変更モーダル (Apple HIG × Arca 準拠)
 *
 * 設計原則 (Core/Rules.md):
 *  - 道具としての静けさ、枠線の完全排除、多層シャドウ、マットゴールド #C5A059
 *  - 絵文字完全禁止、Lucide React アイコン（Clock, Sun, Moon, Check, X, CalendarCheck）のみ使用
 *  - 対象ブロックの自動判別: 選択された出勤日が属する4連勤（出勤1〜4日目）および「次の早番」サイクルを抽出
 *  - 対象日の個別チェックボックス選択（デフォルト全4日選択）
 *  - シフトプリセット:
 *      早番: 5:00, 5:30, 6:00, 6:30, 6:45
 *      遅番: 15:00, 16:00
 *      日勤: 開始・終了時刻を自由に変更可能
 *  - Googleカレンダー双方向自動同期 & Firestore 即時楽観更新
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { Clock, Sun, Check, X, Calendar as CalendarIcon } from "lucide-react";
import type { CalendarEvent, SyncStatus, PMSettings } from "../../types";
import { C } from "../../lib/designSystem";
import {
  getFourDayWorkBlock,
  isWorkEvent,
  shiftDateStr,
  formatShiftTitleWithTime,
} from "../../services/pmCycleService";
import { addMinutesToTime } from "../../services/googleCalendarSync";
import { useModalAnimation } from "../../hooks/useModalAnimation";

export interface ShiftEditModalProps {
  isOpen: boolean;
  targetDate: string; // "YYYY-MM-DD"
  events: CalendarEvent[];
  pmSettings?: PMSettings | null;
  googleSyncStatus?: SyncStatus;
  isGoogleSignedIn?: boolean;
  onClose: () => void;
  onSave: (params: {
    dates: string[];
    title: string;
    startTime: string;
    endTime: string;
    scope: "single" | "four_day";
  }) => Promise<void>;
}

export type ShiftCategory = "early" | "late" | "day";

export interface EarlyPreset {
  label: string;
  startTime: string;
  endTime: string;
}

export const EARLY_PRESETS: EarlyPreset[] = [
  { label: "5:00", startTime: "05:00", endTime: "13:30" },
  { label: "5:30", startTime: "05:30", endTime: "14:00" },
  { label: "6:00", startTime: "06:00", endTime: "14:30" },
  { label: "6:30", startTime: "06:30", endTime: "15:00" },
  { label: "6:45", startTime: "06:45", endTime: "15:15" },
];

export const LATE_PRESETS: EarlyPreset[] = [
  { label: "15:00", startTime: "15:00", endTime: "23:30" },
  { label: "16:00", startTime: "16:00", endTime: "00:30" },
];

const JAPANESE_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function ShiftEditModal({
  isOpen,
  targetDate,
  events,
  pmSettings,
  onClose,
  onSave,
}: ShiftEditModalProps) {
  // ── 対象サイクルブロックの抽出 ──
  // 1. 今回の4連勤ブロック
  const currentFourDayDates = useMemo(() => {
    return getFourDayWorkBlock(targetDate, events, pmSettings);
  }, [targetDate, events, pmSettings]);

  // 2. 次回の早番ブロック（直近未来の「早番」または2サイクル後12日後）
  const nextEarlyFourDayDates = useMemo(() => {
    if (currentFourDayDates.length === 0) return [];
    const lastDate = currentFourDayDates[currentFourDayDates.length - 1];

    // イベントの中から lastDate より後の最初の "早番" を検索
    const futureEarlyEvent = events
      .filter((e) => e.date > lastDate && e.title.includes("早番"))
      .sort((a, b) => a.date.localeCompare(b.date))[0];

    if (futureEarlyEvent) {
      return getFourDayWorkBlock(futureEarlyEvent.date, events, pmSettings);
    }

    // 2交代制（早番→遅番→早番）を想定して12日後、または次の出勤ブロック
    const twoCyclesLater = shiftDateStr(currentFourDayDates[0], 12);
    const candidateBlock = getFourDayWorkBlock(twoCyclesLater, events, pmSettings);
    if (candidateBlock.length > 0) return candidateBlock;

    // フォールバック: 次の出勤ブロック (+6日)
    return getFourDayWorkBlock(shiftDateStr(currentFourDayDates[0], 6), events, pmSettings);
  }, [currentFourDayDates, events, pmSettings]);

  // 対象サイクル選択: "current" (今回の4連勤) | "next_early" (次回の早番) — デフォルトは "next_early"
  const [cycleTab, setCycleTab] = useState<"current" | "next_early">("next_early");

  // アクティブな4日間リスト
  const activeFourDayDates = useMemo(() => {
    if (cycleTab === "next_early" && nextEarlyFourDayDates.length > 0) {
      return nextEarlyFourDayDates;
    }
    return currentFourDayDates;
  }, [cycleTab, nextEarlyFourDayDates, currentFourDayDates]);

  // チェックボックスで選択された日付リスト（デフォルトで4日すべて選択）
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

  // シフトカテゴリ: "early" | "late" | "day"
  const [shiftCategory, setShiftCategory] = useState<ShiftCategory>("early");

  // 入力フォームステート
  const [title, setTitle] = useState<string>("早番(6時)");
  const [startTime, setStartTime] = useState<string>("06:00");
  const [endTime, setEndTime] = useState<string>("14:30");
  const [saving, setSaving] = useState(false);

  // モーダルを開いたときの初期化（デフォルトは「次回の早番」）
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      const defaultDates =
        nextEarlyFourDayDates.length > 0 ? nextEarlyFourDayDates : currentFourDayDates;
      setCycleTab("next_early");
      setSelectedDates(defaultDates);

      // 次回の早番または対象日の出勤イベントから初期値を推定
      const sampleDate = defaultDates[0] || targetDate;
      const dayWork =
        events.find((e) => e.date === sampleDate && isWorkEvent(e.title)) ||
        events.find((e) => e.date === targetDate && isWorkEvent(e.title));

      if (dayWork) {
        if (dayWork.title.includes("遅番") || (dayWork.startTime && dayWork.startTime >= "14:00")) {
          const st = dayWork.startTime === "16:00" ? "16:00" : "15:00";
          const et = dayWork.startTime === "16:00" ? "00:30" : "23:30";
          setShiftCategory("late");
          setStartTime(st);
          setEndTime(et);
          setTitle(formatShiftTitleWithTime("遅番", st, true));
        } else if (dayWork.title.includes("日勤")) {
          const st = dayWork.startTime || "08:30";
          const et = dayWork.endTime || "17:00";
          setShiftCategory("day");
          setStartTime(st);
          setEndTime(et);
          setTitle(formatShiftTitleWithTime(dayWork.title || "日勤", st, true));
        } else {
          // 早番
          setShiftCategory("early");
          const matched = EARLY_PRESETS.find((p) => p.startTime === dayWork.startTime);
          const st = matched ? matched.startTime : dayWork.startTime || "06:00";
          const et = matched ? matched.endTime : dayWork.endTime || "14:30";
          setStartTime(st);
          setEndTime(et);
          setTitle(formatShiftTitleWithTime("早番", st, true));
        }
      } else {
        // デフォルト: 早番 06:00〜14:30
        setShiftCategory("early");
        setStartTime("06:00");
        setEndTime("14:30");
        setTitle(formatShiftTitleWithTime("早番", "06:00", true));
      }
      setSaving(false);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, targetDate, events, currentFourDayDates, nextEarlyFourDayDates]);

  // サイクルタブを切り替えたら選択日付をその4日間にリセット
  const handleSwitchCycleTab = (tab: "current" | "next_early") => {
    setCycleTab(tab);
    const targetBlock = tab === "next_early" ? nextEarlyFourDayDates : currentFourDayDates;
    setSelectedDates(targetBlock);
  };

  const { shouldRender, isClosing, handleClose } = useModalAnimation({ isOpen, onClose });

  // Escapeキーで閉じる
  useEffect(() => {
    if (!shouldRender || isClosing) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [shouldRender, isClosing, handleClose]);

  if (!shouldRender) return null;

  // チェックボックスのトグル
  const handleToggleDate = (dateStr: string) => {
    setSelectedDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
    );
  };

  // 全選択・全解除トグル
  const handleToggleAllDates = () => {
    if (selectedDates.length === activeFourDayDates.length) {
      setSelectedDates([]);
    } else {
      setSelectedDates([...activeFourDayDates]);
    }
  };

  // カテゴリ変更
  const handleSelectCategory = (cat: ShiftCategory) => {
    setShiftCategory(cat);
    if (cat === "early") {
      setStartTime("06:00");
      setEndTime("14:30");
      setTitle(formatShiftTitleWithTime("早番", "06:00", true));
    } else if (cat === "late") {
      setStartTime("15:00");
      setEndTime("23:30");
      setTitle(formatShiftTitleWithTime("遅番", "15:00", true));
    } else {
      setStartTime("08:30");
      setEndTime("17:00");
      setTitle(formatShiftTitleWithTime("日勤", "08:30", true));
    }
  };

  // 早番プリセット選択
  const handleSelectEarlyPreset = (preset: EarlyPreset) => {
    setShiftCategory("early");
    setStartTime(preset.startTime);
    setEndTime(preset.endTime);
    setTitle(formatShiftTitleWithTime("早番", preset.startTime, true));
  };

  // 遅番プリセット選択
  const handleSelectLatePreset = (preset: EarlyPreset) => {
    setShiftCategory("late");
    setStartTime(preset.startTime);
    setEndTime(preset.endTime);
    setTitle(formatShiftTitleWithTime("遅番", preset.startTime, true));
  };

  // 時間ピッカーをワンクリックで開く補助関数
  const openTimePicker = (e: React.MouseEvent<HTMLInputElement>) => {
    try {
      (e.currentTarget as HTMLInputElement).showPicker?.();
    } catch {
      // showPicker 非対応環境では標準動作にフォールバック
    }
  };

  // 保存ハンドラ
  const handleApply = async () => {
    if (saving || selectedDates.length === 0 || !startTime.trim()) return;

    const baseFallback =
      shiftCategory === "early" ? "早番" : shiftCategory === "late" ? "遅番" : "日勤";
    const formattedTitle =
      formatShiftTitleWithTime(title.trim() || baseFallback, startTime.trim(), true) ||
      baseFallback;

    setSaving(true);
    try {
      await onSave({
        dates: selectedDates,
        title: formattedTitle,
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        scope: selectedDates.length === activeFourDayDates.length ? "four_day" : "single",
      });
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  // 日付ラベルフォーマット補助
  const formatBlockSummary = (dates: string[]) => {
    if (!dates || dates.length === 0) return "";
    const startObj = new Date(`${dates[0]}T00:00:00`);
    const endObj = new Date(`${dates[dates.length - 1]}T00:00:00`);
    return `${startObj.getMonth() + 1}/${startObj.getDate()}〜${endObj.getMonth() + 1}/${endObj.getDate()}`;
  };

  const isAllSelected = selectedDates.length === activeFourDayDates.length && activeFourDayDates.length > 0;

  return (
    <div
      onClick={handleClose}
      className={`arca-modal-backdrop ${isClosing ? "is-closing" : ""}`}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(44, 44, 46, 0.4)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        boxSizing: "border-box",
      }}
      data-testid="shift-edit-modal-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`arca-card arca-modal-window ${isClosing ? "is-closing" : ""}`}
        style={{
          width: "100%",
          maxWidth: "560px",
          maxHeight: "92vh",
          overflowY: "auto",
          background: "var(--bg-card-solid)",
          boxShadow: "0 20px 48px -12px rgba(0, 0, 0, 0.18), 0 4px 16px -2px rgba(0, 0, 0, 0.06)",
          borderRadius: "24px",
          padding: "1.9rem 2rem 1.7rem",
          boxSizing: "border-box",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "1.35rem",
        }}
        data-testid="shift-edit-modal"
      >
        {/* ── ヘッダー ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <Clock style={{ width: "1.2rem", height: "1.2rem", color: C.goldDark }} />
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-main)", margin: 0, letterSpacing: "-0.02em" }}>
              出勤時間・シフト変更
            </h2>
          </div>

          <button
            type="button"
            onClick={handleClose}
            style={{
              background: "var(--bg-nav-track)",
              border: "none",
              borderRadius: "50%",
              width: "30px",
              height: "30px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--text-muted)",
              transition: "background 0.15s ease",
            }}
            title="閉じる"
          >
            <X style={{ width: "1rem", height: "1rem" }} />
          </button>
        </div>

        {/* ── 対象サイクル切り替えタブ（今回の4連勤 / 次回の早番） ── */}
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              background: "var(--bg-nav-track)",
              padding: "5px",
              borderRadius: "14px",
            }}
          >
            <button
              type="button"
              onClick={() => handleSwitchCycleTab("current")}
              data-testid="cycle-tab-current"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "0.6rem 0.5rem",
                borderRadius: "10px",
                border: "none",
                background: cycleTab === "current" ? "var(--bg-card-solid)" : "transparent",
                boxShadow: cycleTab === "current" ? "0 2px 8px rgba(0, 0, 0, 0.09)" : "none",
                color: cycleTab === "current" ? C.goldDark : "var(--text-muted)",
                fontWeight: cycleTab === "current" ? 700 : 500,
                fontSize: "0.84rem",
                cursor: "pointer",
                transition: "all 0.18s ease",
              }}
            >
              <span>今回の4連勤</span>
              <span style={{ fontSize: "0.7rem", opacity: 0.85, marginTop: "0.18rem" }}>
                {formatBlockSummary(currentFourDayDates)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchCycleTab("next_early")}
              data-testid="cycle-tab-next-early"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "0.6rem 0.5rem",
                borderRadius: "10px",
                border: "none",
                background: cycleTab === "next_early" ? "var(--bg-card-solid)" : "transparent",
                boxShadow: cycleTab === "next_early" ? "0 2px 8px rgba(0, 0, 0, 0.09)" : "none",
                color: cycleTab === "next_early" ? C.goldDark : "var(--text-muted)",
                fontWeight: cycleTab === "next_early" ? 700 : 500,
                fontSize: "0.84rem",
                cursor: "pointer",
                transition: "all 0.18s ease",
              }}
            >
              <span>次回の早番</span>
              <span style={{ fontSize: "0.7rem", opacity: 0.85, marginTop: "0.18rem" }}>
                {formatBlockSummary(nextEarlyFourDayDates) || "次サイクル"}
              </span>
            </button>
          </div>
        </div>

        {/* ── 変更対象の4日間リスト（左側チェックボックス付き・デフォルト全選択） ── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 650, color: C.charcoalLight, letterSpacing: "0.06em" }}>
              変更対象の日程 ({selectedDates.length}/{activeFourDayDates.length}日選択中)
            </label>
            <button
              type="button"
              onClick={handleToggleAllDates}
              style={{
                background: "transparent",
                border: "none",
                padding: "0.15rem 0.35rem",
                fontSize: "0.74rem",
                fontWeight: 600,
                color: C.goldDark,
                cursor: "pointer",
              }}
            >
              {isAllSelected ? "全解除" : "全選択"}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
            {activeFourDayDates.map((dateStr, idx) => {
              const isChecked = selectedDates.includes(dateStr);
              const dObj = new Date(`${dateStr}T00:00:00`);
              const wDay = JAPANESE_WEEKDAYS[dObj.getDay()];
              const currentWork = events.find((e) => e.date === dateStr && isWorkEvent(e.title));
              const currentTime = currentWork?.startTime
                ? `${currentWork.startTime}〜${currentWork.endTime || ""}`
                : "未設定";

              return (
                <div
                  key={dateStr}
                  onClick={() => handleToggleDate(dateStr)}
                  data-testid={`shift-date-row-${dateStr}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.6rem 0.85rem",
                    background: isChecked ? "rgba(197, 160, 89, 0.12)" : "var(--bg-nav-track)",
                    borderRadius: "12px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    userSelect: "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                    {/* チェックボックス */}
                    <div
                      style={{
                        width: "19px",
                        height: "19px",
                        borderRadius: "5px",
                        border: "none",
                        background: isChecked ? C.gold : "rgba(128, 128, 128, 0.2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.15s ease",
                        flexShrink: 0,
                      }}
                    >
                      {isChecked && <Check style={{ width: "12px", height: "12px", color: "#FFFFFF" }} strokeWidth={3} />}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                      <span style={{ fontWeight: 650, fontSize: "0.86rem", color: isChecked ? "var(--text-main)" : "var(--text-muted)" }}>
                        {dObj.getMonth() + 1}/{dObj.getDate()} ({wDay})
                      </span>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", opacity: 0.85 }}>
                        {idx + 1}日目
                      </span>
                    </div>
                  </div>

                  {/* 変更プレビュー */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem" }}>
                    {isChecked ? (
                      <>
                        <span style={{ color: "var(--text-muted)", textDecoration: "line-through", fontSize: "0.72rem" }}>
                          {currentTime}
                        </span>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>→</span>
                        <span style={{ fontWeight: 700, color: C.goldDark }}>
                          {startTime}〜{endTime}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontSize: "0.74rem" }}>
                        変更なし
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── シフトカテゴリ切り替え（早番 / 遅番 / 日勤） ── */}
        <div>
          <label style={{ fontSize: "0.75rem", fontWeight: 650, color: "var(--text-muted)", letterSpacing: "0.06em", display: "block", marginBottom: "0.45rem" }}>
            シフトタイプ
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "8px",
              background: "var(--bg-nav-track)",
              padding: "5px",
              borderRadius: "14px",
            }}
          >
            <button
              type="button"
              onClick={() => handleSelectCategory("early")}
              data-testid="shift-cat-early"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                padding: "0.55rem 0.5rem",
                borderRadius: "10px",
                border: "none",
                background: shiftCategory === "early" ? "var(--bg-card-solid)" : "transparent",
                boxShadow: shiftCategory === "early" ? "0 2px 8px rgba(0, 0, 0, 0.09)" : "none",
                color: shiftCategory === "early" ? C.goldDark : "var(--text-muted)",
                fontWeight: shiftCategory === "early" ? 700 : 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                transition: "all 0.18s ease",
              }}
            >
              <Sun style={{ width: "0.9rem", height: "0.9rem" }} />
              <span>早番</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectCategory("late")}
              data-testid="shift-cat-late"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                padding: "0.55rem 0.5rem",
                borderRadius: "10px",
                border: "none",
                background: shiftCategory === "late" ? "var(--bg-card-solid)" : "transparent",
                boxShadow: shiftCategory === "late" ? "0 2px 8px rgba(0, 0, 0, 0.09)" : "none",
                color: shiftCategory === "late" ? C.goldDark : "var(--text-muted)",
                fontWeight: shiftCategory === "late" ? 700 : 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                transition: "all 0.18s ease",
              }}
            >
              <Clock style={{ width: "0.9rem", height: "0.9rem" }} />
              <span>遅番</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectCategory("day")}
              data-testid="shift-cat-day"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                padding: "0.55rem 0.5rem",
                borderRadius: "10px",
                border: "none",
                background: shiftCategory === "day" ? "var(--bg-card-solid)" : "transparent",
                boxShadow: shiftCategory === "day" ? "0 2px 8px rgba(0, 0, 0, 0.09)" : "none",
                color: shiftCategory === "day" ? C.goldDark : "var(--text-muted)",
                fontWeight: shiftCategory === "day" ? 700 : 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                transition: "all 0.18s ease",
              }}
            >
              <CalendarIcon style={{ width: "0.9rem", height: "0.9rem" }} />
              <span>日勤</span>
            </button>
          </div>
        </div>

        {/* ── シフト時間プリセット選択 ── */}
        <div>
          {shiftCategory === "early" && (
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 650, color: "var(--text-muted)", letterSpacing: "0.06em", display: "block", marginBottom: "0.45rem" }}>
                早番の開始時刻を選択
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px" }}>
                {EARLY_PRESETS.map((p) => {
                  const isSelected = startTime === p.startTime;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleSelectEarlyPreset(p)}
                      data-testid={`preset-early-${p.label.replace(":", "")}`}
                      style={{
                        padding: "0.65rem 0.3rem",
                        borderRadius: "12px",
                        border: "none",
                        background: isSelected ? C.goldFaint : "var(--bg-nav-track)",
                        boxShadow: isSelected ? "0 1px 4px rgba(197, 160, 89, 0.25)" : "none",
                        color: isSelected ? C.goldDark : "var(--text-main)",
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: "0.85rem",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        textAlign: "center",
                      }}
                    >
                      <div>{p.label}</div>
                      <div style={{ fontSize: "0.66rem", opacity: 0.75, marginTop: "0.15rem" }}>
                        〜{p.endTime}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {shiftCategory === "late" && (
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 650, color: "var(--text-muted)", letterSpacing: "0.06em", display: "block", marginBottom: "0.45rem" }}>
                遅番の開始時刻を選択
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {LATE_PRESETS.map((p) => {
                  const isSelected = startTime === p.startTime;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleSelectLatePreset(p)}
                      data-testid={`preset-late-${p.label.replace(":", "")}`}
                      style={{
                        padding: "0.75rem 0.8rem",
                        borderRadius: "12px",
                        border: "none",
                        background: isSelected ? C.goldFaint : "var(--bg-nav-track)",
                        boxShadow: isSelected ? "0 1px 4px rgba(197, 160, 89, 0.25)" : "none",
                        color: isSelected ? C.goldDark : "var(--text-main)",
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: "0.88rem",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div>{p.label}</div>
                        <div style={{ fontSize: "0.7rem", opacity: 0.75, marginTop: "0.15rem" }}>
                          {p.startTime} 〜 {p.endTime}
                        </div>
                      </div>
                      {isSelected && <Check style={{ width: "1rem", height: "1rem", color: C.goldDark }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {shiftCategory === "day" && (
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 650, color: "var(--text-muted)", letterSpacing: "0.06em", display: "block", marginBottom: "0.45rem" }}>
                日勤の時刻を選択
              </label>
              <div
                style={{
                  background: "var(--bg-nav-track)",
                  padding: "0.95rem 1.1rem",
                  borderRadius: "14px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div>
                  <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "0.3rem" }}>
                    開始時刻
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onClick={openTimePicker}
                    onChange={(e) => {
                      const val = e.target.value;
                      setStartTime(val);
                      if (val && /^\d{1,2}:\d{2}$/.test(val)) {
                        setEndTime(addMinutesToTime(val, 510));
                        setTitle((prev) => formatShiftTitleWithTime(prev || "日勤", val, true));
                      }
                    }}
                    className="appearance-none"
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      fontSize: "0.92rem",
                      fontWeight: 650,
                      color: "var(--text-main)",
                      background: "var(--bg-card-solid)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "8px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      boxSizing: "border-box",
                      cursor: "pointer",
                    }}
                    data-testid="shift-start-time-input"
                  />
                </div>

                <div>
                  <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "0.3rem" }}>
                    終了時刻
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onClick={openTimePicker}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="appearance-none"
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      fontSize: "0.92rem",
                      fontWeight: 650,
                      color: "var(--text-main)",
                      background: "var(--bg-card-solid)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "8px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      boxSizing: "border-box",
                      cursor: "pointer",
                    }}
                    data-testid="shift-end-time-input"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 詳細微調整（タイトル / カスタム時間） ── */}
        {shiftCategory !== "day" && (
          <div
            style={{
              background: "var(--bg-nav-track)",
              padding: "0.85rem 1rem",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.85rem",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flex: 1, minWidth: "160px" }}>
              <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>
                予定名:
              </span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{
                  padding: "0.35rem 0.6rem",
                  fontSize: "0.82rem",
                  color: "var(--text-main)",
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "8px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  width: "130px",
                }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <input
                type="time"
                value={startTime}
                onClick={openTimePicker}
                onChange={(e) => {
                  const val = e.target.value;
                  setStartTime(val);
                  if (val && /^\d{1,2}:\d{2}$/.test(val)) {
                    setEndTime(addMinutesToTime(val, 510));
                    const defaultBase = shiftCategory === "early" ? "早番" : "遅番";
                    setTitle((prev) => formatShiftTitleWithTime(prev || defaultBase, val, true));
                  }
                }}
                style={{
                  padding: "0.35rem 0.55rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "var(--text-main)",
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "8px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  minWidth: "105px",
                  cursor: "pointer",
                }}
              />
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>〜</span>
              <input
                type="time"
                value={endTime}
                onClick={openTimePicker}
                onChange={(e) => setEndTime(e.target.value)}
                style={{
                  padding: "0.35rem 0.55rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "var(--text-main)",
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "8px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  minWidth: "105px",
                  cursor: "pointer",
                }}
              />
            </div>
          </div>
        )}

        {/* ── フッターアクション（左下テキスト削除・ボタン1行維持） ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            marginTop: "0.25rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "nowrap" }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              style={{
                padding: "0.6rem 1.15rem",
                borderRadius: "12px",
                border: "none",
                background: "rgba(0, 0, 0, 0.04)",
                color: C.charcoalLight,
                fontSize: "0.84rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.15s ease",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={saving || selectedDates.length === 0 || !startTime.trim()}
              data-testid="shift-edit-save-btn"
              style={{
                padding: "0.6rem 1.35rem",
                borderRadius: "12px",
                border: "none",
                background: C.gold,
                color: "#FDFCFA",
                fontSize: "0.84rem",
                fontWeight: 700,
                cursor: saving || selectedDates.length === 0 || !startTime.trim() ? "default" : "pointer",
                boxShadow: "0 2px 8px rgba(197, 160, 89, 0.3)",
                opacity: saving || selectedDates.length === 0 || !startTime.trim() ? 0.6 : 1,
                transition: "all 0.15s ease",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {saving
                ? "保存中…"
                : selectedDates.length === 0
                ? "日付を選択"
                : selectedDates.length === activeFourDayDates.length
                ? "4日間を一括保存"
                : `${selectedDates.length}日分を保存`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShiftEditModal;
