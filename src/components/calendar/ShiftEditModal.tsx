/**
 * src/components/calendar/ShiftEditModal.tsx
 * Arca — 4連勤ワンシフト一括変更モーダル (Apple HIG × Arca 準拠)
 *
 * 設計原則 (Core/Rules.md):
 *  - 道具としての静けさ、枠線の完全排除、多層シャドウ、マットゴールド #C5A059
 *  - 絵文字完全禁止、Lucide React アイコン（Clock, Sun, Moon, Check, X）のみ使用
 *  - 対象ブロックの自動判別: 選択された出勤日が属する4連勤（出勤1〜4日目）を自動抽出
 *  - 範囲選択: 「この日（1日）のみ」または「この4連勤を一括変更（推奨）」
 *  - クイックプリセット: 早番(06:00〜15:00), 遅番(15:00〜24:00), 遅番(16:00〜01:00), カスタム
 *  - Googleカレンダー双方向自動同期 & Firestore 即時楽観更新
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { Clock, Sun, Check, X } from "lucide-react";
import type { CalendarEvent, SyncStatus, PMSettings } from "../../types";
import { C } from "../../lib/designSystem";
import { getFourDayWorkBlock, isWorkEvent } from "../../services/pmCycleService";

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

export interface ShiftPreset {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  label: string;
}

export const SHIFT_PRESETS: ShiftPreset[] = [
  { id: "early", title: "早番", startTime: "06:00", endTime: "15:00", label: "早番 (06:00〜15:00)" },
  { id: "late-15", title: "遅番", startTime: "15:00", endTime: "24:00", label: "遅番 (15:00〜24:00)" },
  { id: "late-16", title: "遅番", startTime: "16:00", endTime: "01:00", label: "遅番 (16:00〜01:00)" },
  { id: "custom", title: "出勤", startTime: "", endTime: "", label: "カスタム指定" },
];

const JAPANESE_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function ShiftEditModal({
  isOpen,
  targetDate,
  events,
  pmSettings,
  googleSyncStatus = "idle",
  isGoogleSignedIn = false,
  onClose,
  onSave,
}: ShiftEditModalProps) {
  // 4連勤ブロックの抽出
  const fourDayDates = useMemo(() => {
    return getFourDayWorkBlock(targetDate, events, pmSettings);
  }, [targetDate, events, pmSettings]);

  // モーダルステート
  const [scope, setScope] = useState<"four_day" | "single">("four_day");
  const [selectedPresetId, setSelectedPresetId] = useState<string>("early");
  const [title, setTitle] = useState<string>("早番");
  const [startTime, setStartTime] = useState<string>("06:00");
  const [endTime, setEndTime] = useState<string>("15:00");
  const [saving, setSaving] = useState(false);

  // モーダルを開いたときの初期化
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setScope("four_day");
      // 既存の当日出勤イベントがあればその時刻を初期値として推定
      const dayWork = events.find((e) => e.date === targetDate && isWorkEvent(e.title));
      if (dayWork && dayWork.startTime) {
        // プリセットにマッチするか確認
        const matched = SHIFT_PRESETS.find(
          (p) => p.id !== "custom" && p.startTime === dayWork.startTime && p.endTime === dayWork.endTime
        );
        if (matched) {
          setSelectedPresetId(matched.id);
          setTitle(matched.title);
          setStartTime(matched.startTime);
          setEndTime(matched.endTime);
        } else {
          setSelectedPresetId("custom");
          setTitle(dayWork.title || "出勤");
          setStartTime(dayWork.startTime);
          setEndTime(dayWork.endTime || "");
        }
      } else {
        // デフォルトは早番
        setSelectedPresetId("early");
        setTitle("早番");
        setStartTime("06:00");
        setEndTime("15:00");
      }
      setSaving(false);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, targetDate, events]);

  // Escapeキーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // プリセット選択ハンドラ
  const handleSelectPreset = (preset: ShiftPreset) => {
    setSelectedPresetId(preset.id);
    if (preset.id !== "custom") {
      setTitle(preset.title);
      setStartTime(preset.startTime);
      setEndTime(preset.endTime);
    }
  };

  // 保存ハンドラ
  const handleApply = async () => {
    if (saving) return;
    if (!startTime.trim()) return;

    setSaving(true);
    try {
      const datesToUpdate = scope === "four_day" ? fourDayDates : [targetDate];
      await onSave({
        dates: datesToUpdate,
        title: title.trim() || "出勤",
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        scope,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // 日付の和風フォーマット
  const targetDateObj = new Date(`${targetDate}T00:00:00`);
  const formattedTargetDate = `${targetDateObj.getMonth() + 1}月${targetDateObj.getDate()}日 (${JAPANESE_WEEKDAYS[targetDateObj.getDay()]})`;

  // 4連勤の日付範囲表示
  const blockStartObj = new Date(`${fourDayDates[0]}T00:00:00`);
  const blockEndObj = new Date(`${fourDayDates[3] || fourDayDates[fourDayDates.length - 1]}T00:00:00`);
  const formattedBlockRange = `${blockStartObj.getMonth() + 1}月${blockStartObj.getDate()}日(${JAPANESE_WEEKDAYS[blockStartObj.getDay()]}) 〜 ${blockEndObj.getMonth() + 1}月${blockEndObj.getDate()}日(${JAPANESE_WEEKDAYS[blockEndObj.getDay()]}) (4連勤)`;

  const effectiveDates = scope === "four_day" ? fourDayDates : [targetDate];

  return (
    <div
      onClick={onClose}
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
        padding: "1rem",
        boxSizing: "border-box",
        animation: "arca-overlay-in 0.18s ease",
      }}
      data-testid="shift-edit-modal-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="arca-card"
        style={{
          width: "100%",
          maxWidth: "480px",
          maxHeight: "92vh",
          overflowY: "auto",
          background: "var(--bg-card-solid)",
          boxShadow: "0 20px 48px -12px rgba(0, 0, 0, 0.18), 0 4px 16px -2px rgba(0, 0, 0, 0.06)",
          borderRadius: "24px",
          padding: "1.75rem 1.75rem 1.5rem",
          boxSizing: "border-box",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
        data-testid="shift-edit-modal"
      >
        {/* ── ヘッダー ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.25rem" }}>
              <Clock style={{ width: "1.1rem", height: "1.1rem", color: C.goldDark }} />
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: C.charcoal, margin: 0, letterSpacing: "-0.02em" }}>
                出勤時間・シフト変更
              </h2>
            </div>
            <p style={{ fontSize: "0.78rem", color: C.charcoalLight, margin: 0 }}>
              {formattedTargetDate} のワンシフト時間調整
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(0, 0, 0, 0.04)",
              border: "none",
              borderRadius: "50%",
              width: "28px",
              height: "28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: C.charcoalLight,
              transition: "background 0.15s ease",
            }}
            title="閉じる"
          >
            <X style={{ width: "0.95rem", height: "0.95rem" }} />
          </button>
        </div>

        {/* ── 変更対象範囲のセグメント選択 ── */}
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 650, color: C.charcoalLight, letterSpacing: "0.06em", display: "block", marginBottom: "0.45rem" }}>
            変更対象範囲
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "6px",
              background: "rgba(0, 0, 0, 0.04)",
              padding: "4px",
              borderRadius: "14px",
            }}
          >
            <button
              type="button"
              onClick={() => setScope("four_day")}
              data-testid="scope-four-day-btn"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "0.55rem 0.4rem",
                borderRadius: "10px",
                border: "none",
                background: scope === "four_day" ? "#FDFCFA" : "transparent",
                boxShadow: scope === "four_day" ? "0 2px 8px rgba(0, 0, 0, 0.07)" : "none",
                color: scope === "four_day" ? C.goldDark : C.charcoalLight,
                fontWeight: scope === "four_day" ? 700 : 500,
                fontSize: "0.8rem",
                cursor: "pointer",
                transition: "all 0.18s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <span>4連勤一括変更</span>
                <span
                  style={{
                    fontSize: "0.6rem",
                    padding: "0.05rem 0.35rem",
                    borderRadius: "4px",
                    background: scope === "four_day" ? C.goldFaint : "rgba(0,0,0,0.06)",
                    color: scope === "four_day" ? C.goldDark : C.charcoalLight,
                    fontWeight: 650,
                  }}
                >
                  推奨
                </span>
              </div>
              <span style={{ fontSize: "0.65rem", color: C.charcoalLight, marginTop: "0.15rem" }}>
                ワンシフト丸ごと
              </span>
            </button>

            <button
              type="button"
              onClick={() => setScope("single")}
              data-testid="scope-single-btn"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "0.55rem 0.4rem",
                borderRadius: "10px",
                border: "none",
                background: scope === "single" ? "#FDFCFA" : "transparent",
                boxShadow: scope === "single" ? "0 2px 8px rgba(0, 0, 0, 0.07)" : "none",
                color: scope === "single" ? C.charcoal : C.charcoalLight,
                fontWeight: scope === "single" ? 700 : 500,
                fontSize: "0.8rem",
                cursor: "pointer",
                transition: "all 0.18s ease",
              }}
            >
              <span>この日（1日）のみ</span>
              <span style={{ fontSize: "0.65rem", color: C.charcoalLight, marginTop: "0.15rem" }}>
                {formattedTargetDate}
              </span>
            </button>
          </div>
          {scope === "four_day" && (
            <p style={{ fontSize: "0.7rem", color: C.charcoalLight, margin: "0.35rem 0 0 0.35rem" }}>
              対象期間: {formattedBlockRange}
            </p>
          )}
        </div>

        {/* ── クイックプリセット ── */}
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 650, color: C.charcoalLight, letterSpacing: "0.06em", display: "block", marginBottom: "0.45rem" }}>
            シフト時間プリセット
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
            {SHIFT_PRESETS.map((preset) => {
              const isSelected = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  data-testid={`preset-${preset.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.65rem 0.8rem",
                    borderRadius: "12px",
                    border: "none",
                    background: isSelected ? C.goldFaint : "rgba(0, 0, 0, 0.03)",
                    boxShadow: isSelected ? "0 1px 4px rgba(197, 160, 89, 0.2)" : "none",
                    color: isSelected ? C.goldDark : C.charcoal,
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    fontWeight: isSelected ? 700 : 500,
                    textAlign: "left",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div>
                    <div>{preset.title}</div>
                    {preset.startTime && (
                      <div style={{ fontSize: "0.68rem", color: isSelected ? C.goldDark : C.charcoalLight, marginTop: "0.1rem" }}>
                        {preset.startTime} 〜 {preset.endTime}
                      </div>
                    )}
                  </div>
                  {isSelected && <Check style={{ width: "0.95rem", height: "0.95rem", color: C.goldDark, flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 時間詳細設定フォーム ── */}
        <div
          style={{
            background: "rgba(0, 0, 0, 0.02)",
            padding: "0.9rem 1rem",
            borderRadius: "14px",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <label style={{ fontSize: "0.68rem", fontWeight: 600, color: C.charcoalLight, display: "block", marginBottom: "0.25rem" }}>
                開始時刻
              </label>
              <input
                type="text"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setSelectedPresetId("custom");
                }}
                placeholder="06:00"
                inputMode="numeric"
                className="appearance-none"
                style={{
                  width: "100%",
                  padding: "0.45rem 0.6rem",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: C.charcoal,
                  background: "#FDFCFA",
                  border: "none",
                  borderRadius: "8px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  boxSizing: "border-box",
                }}
                data-testid="shift-start-time-input"
              />
            </div>
            <div>
              <label style={{ fontSize: "0.68rem", fontWeight: 600, color: C.charcoalLight, display: "block", marginBottom: "0.25rem" }}>
                終了時刻
              </label>
              <input
                type="text"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setSelectedPresetId("custom");
                }}
                placeholder="15:00 / 24:00"
                inputMode="numeric"
                className="appearance-none"
                style={{
                  width: "100%",
                  padding: "0.45rem 0.6rem",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: C.charcoal,
                  background: "#FDFCFA",
                  border: "none",
                  borderRadius: "8px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  boxSizing: "border-box",
                }}
                data-testid="shift-end-time-input"
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: "0.68rem", fontWeight: 600, color: C.charcoalLight, display: "block", marginBottom: "0.25rem" }}>
              予定タイトル / シフト名
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSelectedPresetId("custom");
              }}
              placeholder="例: 早番, 遅番, 日勤"
              style={{
                width: "100%",
                padding: "0.45rem 0.6rem",
                fontSize: "0.85rem",
                color: C.charcoal,
                background: "#FDFCFA",
                border: "none",
                borderRadius: "8px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                boxSizing: "border-box",
              }}
              data-testid="shift-title-input"
            />
          </div>
        </div>

        {/* ── 対象日程プレビュー ── */}
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 650, color: C.charcoalLight, letterSpacing: "0.06em", display: "block", marginBottom: "0.35rem" }}>
            変更対象の日程 ({effectiveDates.length}日間)
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {effectiveDates.map((dateStr, idx) => {
              const dObj = new Date(`${dateStr}T00:00:00`);
              const wDay = JAPANESE_WEEKDAYS[dObj.getDay()];
              const currentWork = events.find((e) => e.date === dateStr && isWorkEvent(e.title));
              const currentTime = currentWork?.startTime ? `${currentWork.startTime}〜${currentWork.endTime || ""}` : "未設定";

              return (
                <div
                  key={dateStr}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.35rem 0.6rem",
                    background: "rgba(0, 0, 0, 0.02)",
                    borderRadius: "8px",
                    fontSize: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Sun style={{ width: "0.75rem", height: "0.75rem", color: C.goldDark }} />
                    <span style={{ fontWeight: 600, color: C.charcoal }}>
                      {dObj.getMonth() + 1}/{dObj.getDate()} ({wDay})
                    </span>
                    {scope === "four_day" && (
                      <span style={{ fontSize: "0.65rem", color: C.charcoalLight }}>
                        {idx + 1}日目
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.72rem" }}>
                    <span style={{ color: C.charcoalLight, textDecoration: "line-through" }}>
                      {currentTime}
                    </span>
                    <span style={{ color: C.charcoalLight }}>→</span>
                    <span style={{ fontWeight: 650, color: C.goldDark }}>
                      {startTime}〜{endTime}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── フッターアクション ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.5rem" }}>
          <div style={{ fontSize: "0.7rem", color: C.charcoalLight }}>
            {isGoogleSignedIn
              ? googleSyncStatus === "syncing"
                ? "Googleカレンダー同期中…"
                : "Googleカレンダーも同期更新"
              : "ローカル保存"}
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "0.55rem 1rem",
                borderRadius: "12px",
                border: "none",
                background: "rgba(0, 0, 0, 0.04)",
                color: C.charcoalLight,
                fontSize: "0.82rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.15s ease",
              }}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={saving || !startTime}
              data-testid="shift-edit-save-btn"
              style={{
                padding: "0.55rem 1.25rem",
                borderRadius: "12px",
                border: "none",
                background: C.gold,
                color: "#FDFCFA",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: saving ? "default" : "pointer",
                boxShadow: "0 2px 8px rgba(197, 160, 89, 0.3)",
                opacity: saving || !startTime ? 0.6 : 1,
                transition: "all 0.15s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
            >
              {saving ? "保存中…" : scope === "four_day" ? "4連勤を一括保存" : "保存する"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShiftEditModal;
