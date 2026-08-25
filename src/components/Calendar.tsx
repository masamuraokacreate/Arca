/**
 * src/components/Calendar.tsx
 * Arca — Calendar / カレンダー (Apple HIG × Arca 準拠)
 *
 * 設計原則 (Core/Rules.md):
 *  - 道具としての静けさ、枠線の完全排除と多層シャドウ
 *  - 「予定」セクションには「予定を追加」フォーム
 *  - 「タスク期限」セクションには「タスクを追加」フォーム（期限は選択中の日付/今日に自動設定）
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import {
  syncGoogleCalendarToArca,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from "../services/googleCalendarSync";
import type { CalendarEvent, CalendarTask, SyncStatus } from "../types";
import type { PMSettings, PMTemplateItem, PMLogItem } from "../types/pm";
import { C } from "../lib/designSystem";
import { useUndoToast } from "../hooks/useUndoToast";
import { UndoToast } from "./common/UndoToast";
import {
  buildCalendarPMDates,
  recordPMLog,
  buildLogMapForDate,
  resolveItemStatus,
  resolveDateShiftInfo,
  resolveShiftInfo,
  saveShiftOverride,
  getActivePMTasksForDate,
  DEFAULT_PM_SETTINGS,
} from "../services/pmCycleService";
import { PMShiftOverrideModal } from "./tasks/PMShiftOverrideModal";

type Task = CalendarTask;

// ─────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────

/** "YYYY-MM-DD" を生成 */
function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 今日の日付文字列 */
function todayStr(): string {
  const t = new Date();
  return toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
}

/** 月の最初の曜日（0=日）と日数を返す */
function monthMeta(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay(); // 0=日
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  return { firstDay, daysInMonth, daysInPrev };
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const MONTHS_JA = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"] as const;

// ─────────────────────────────────────────
// SVG アイコン
// ─────────────────────────────────────────
function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" style={{ width: "0.85rem", height: "0.85rem" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" style={{ width: "0.85rem", height: "0.85rem" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" style={{ width: "0.85rem", height: "0.85rem" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" style={{ width: "0.85rem", height: "0.85rem" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
}

// ─────────────────────────────────────────
// EventRow — 予定1件の表示行（インライン編集付き）
// ─────────────────────────────────────────
function EventRow({
  event,
  onDelete,
  onUpdate,
}: {
  event: CalendarEvent;
  onDelete: (event: CalendarEvent) => void;
  onUpdate: (id: string, data: Partial<Omit<CalendarEvent, "id" | "createdAt">>) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(event.title);
  const [editStart, setEditStart] = useState(event.startTime);
  const [editEnd, setEditEnd] = useState(event.endTime);
  const [editNote, setEditNote] = useState(event.note);

  useEffect(() => {
    setEditTitle(event.title);
    setEditStart(event.startTime);
    setEditEnd(event.endTime);
    setEditNote(event.note);
  }, [event]);

  const handleSave = () => {
    if (!editTitle.trim()) return;
    onUpdate(event.id, {
      title: editTitle.trim(),
      startTime: editStart,
      endTime: editEnd,
      note: editNote.trim(),
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(event.title);
    setEditStart(event.startTime);
    setEditEnd(event.endTime);
    setEditNote(event.note);
    setEditing(false);
  };

  const hasTime = event.startTime || event.endTime;
  const timeDisplay =
    event.startTime && event.endTime
      ? `${event.startTime} – ${event.endTime}`
      : event.startTime || event.endTime;

  if (editing) {
    return (
      <li
        style={{
          padding: "0.75rem 0",
          borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder="予定タイトル"
          style={{
            background: "transparent",
            border: "none",
            borderBottom: `1px solid ${C.gold}`,
            outline: "none",
            fontSize: "0.875rem",
            color: C.charcoal,
            padding: "0.2rem 0",
            letterSpacing: "0.01em",
          }}
          autoFocus
        />

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="time"
            value={editStart}
            onChange={(e) => setEditStart(e.target.value)}
            style={timeInputStyle}
          />
          <span style={{ fontSize: "0.72rem", color: C.charcoalLight }}>–</span>
          <input
            type="time"
            value={editEnd}
            onChange={(e) => setEditEnd(e.target.value)}
            style={timeInputStyle}
          />
        </div>

        <input
          type="text"
          value={editNote}
          onChange={(e) => setEditNote(e.target.value)}
          placeholder="メモ（任意）"
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: "0.78rem",
            color: C.charcoalMid,
            padding: "0.15rem 0",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem", marginTop: "0.25rem" }}>
          <button onClick={handleCancel} style={iconBtnStyle(C.charcoalLight)} title="キャンセル">
            <XIcon />
          </button>
          <button onClick={handleSave} style={iconBtnStyle(C.gold)} title="保存">
            <CheckIcon />
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.85rem",
        padding: "0.75rem 0",
        borderBottom: "1px solid rgba(0, 0, 0, 0.035)",
        transition: "background 0.15s ease",
      }}
    >
      <div
        style={{
          width: "3px",
          minHeight: "1.2rem",
          background: C.gold,
          borderRadius: "9999px",
          flexShrink: 0,
          alignSelf: "stretch",
          marginTop: "0.15rem",
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 450, color: C.charcoal, letterSpacing: "0.01em" }}>
          {event.title}
        </p>
        {hasTime && (
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.72rem", color: C.goldDark, letterSpacing: "0.02em" }}>
            {timeDisplay}
          </p>
        )}
        {event.note && (
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.75rem", color: C.charcoalLight, letterSpacing: "0.01em" }}>
            {event.note}
          </p>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s ease",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setEditing(true)}
          style={{ background: "none", border: "none", padding: "0.2rem", cursor: "pointer", color: C.charcoalLight }}
          title="編集"
        >
          <PencilIcon />
        </button>
        <button
          onClick={() => onDelete(event)}
          style={{ background: "none", border: "none", padding: "0.2rem", cursor: "pointer", color: C.charcoalLight }}
          title="削除"
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────
// TaskDueRow — タスク期限行
// ─────────────────────────────────────────
function TaskDueRow({ task }: { task: Task }) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.85rem",
        padding: "0.65rem 0",
        borderBottom: "1px solid rgba(0, 0, 0, 0.035)",
        opacity: task.completed ? 0.45 : 1,
      }}
    >
      <div
        style={{
          width: "2.5px",
          minHeight: "1.1rem",
          background: C.charcoalXLight,
          borderRadius: "9999px",
          flexShrink: 0,
          alignSelf: "stretch",
          marginTop: "0.15rem",
        }}
      />
      <p
        style={{
          margin: 0,
          flex: 1,
          fontSize: "0.83rem",
          fontWeight: 400,
          color: C.charcoal,
          letterSpacing: "0.01em",
          textDecoration: task.completed ? "line-through" : "none",
        }}
      >
        {task.title}
      </p>
      {task.completed && (
        <span style={{ fontSize: "0.65rem", color: C.charcoalLight, letterSpacing: "0.04em" }}>完了済み</span>
      )}
    </li>
  );
}

// ─────────────────────────────────────────
// AddEventForm — 予定追加フォーム
// ─────────────────────────────────────────
function AddEventForm({
  selectedDate,
  onAdd,
}: {
  selectedDate: string;
  onAdd: (data: { title: string; date: string; startTime: string; endTime: string; note: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setTitle("");
    setStartTime("");
    setEndTime("");
    setNote("");
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") reset();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, reset]);

  const handleAdd = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await onAdd({ title: title.trim(), date: selectedDate, startTime, endTime, note });
      reset();
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
          background: "none",
          border: "none",
          padding: "0.65rem 0",
          cursor: "pointer",
          fontSize: "0.78rem",
          color: C.charcoalLight,
          letterSpacing: "0.02em",
          fontWeight: 500,
          transition: "color 0.15s ease",
          width: "100%",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = C.gold)}
        onMouseLeave={(e) => (e.currentTarget.style.color = C.charcoalLight)}
      >
        <span style={{ fontSize: "1.05rem", lineHeight: 1 }}>+</span>
        <span>予定を追加</span>
      </button>
    );
  }

  return (
    <div
      className="arca-card"
      onKeyDown={(e) => {
        if (e.key === "Escape") reset();
      }}
      style={{
        padding: "1rem 1.15rem",
        marginTop: "0.5rem",
        animation: "arca-module-in 0.18s ease",
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
        }}
        placeholder="予定タイトル"
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: "transparent",
          border: "none",
          borderBottom: `1px solid ${C.gold}`,
          outline: "none",
          fontSize: "0.875rem",
          color: C.charcoal,
          padding: "0.2rem 0",
          letterSpacing: "0.01em",
          marginBottom: "0.65rem",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <span style={labelStyle}>開始</span>
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          style={timeInputStyle}
        />
        <span style={{ fontSize: "0.72rem", color: C.charcoalLight }}>–</span>
        <span style={labelStyle}>終了</span>
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          style={timeInputStyle}
        />
      </div>

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="メモ（任意）"
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: "transparent",
          border: "none",
          outline: "none",
          fontSize: "0.78rem",
          color: C.charcoalMid,
          padding: "0.15rem 0",
          marginBottom: "0.65rem",
        }}
      />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem" }}>
        <button
          onClick={reset}
          style={{
            background: "none",
            border: "none",
            padding: "0.35rem 0.75rem",
            fontSize: "0.75rem",
            color: C.charcoalLight,
            cursor: "pointer",
          }}
        >
          キャンセル
        </button>
        <button
          onClick={handleAdd}
          disabled={!title.trim() || saving}
          style={{
            background: title.trim() ? C.gold : "rgba(0, 0, 0, 0.06)",
            color: title.trim() ? "#FDFCFA" : C.charcoalXLight,
            border: "none",
            borderRadius: "8px",
            padding: "0.35rem 0.85rem",
            fontSize: "0.75rem",
            fontWeight: 600,
            cursor: title.trim() ? "pointer" : "default",
            transition: "all 0.15s ease",
          }}
        >
          追加
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// AddTaskForm — タスク追加フォーム（期限は選択日に設定）
// ─────────────────────────────────────────
function AddTaskForm({
  selectedDate,
  isToday,
  onAdd,
}: {
  selectedDate: string;
  isToday: boolean;
  onAdd: (title: string, dueDate: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setTitle("");
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") reset();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, reset]);

  const handleAdd = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await onAdd(title.trim(), selectedDate);
      reset();
    } finally {
      setSaving(false);
    }
  };

  const labelText = isToday ? "今日のタスクを追加" : "タスクを追加";

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
          background: "none",
          border: "none",
          padding: "0.65rem 0",
          cursor: "pointer",
          fontSize: "0.78rem",
          color: C.charcoalLight,
          letterSpacing: "0.02em",
          fontWeight: 500,
          transition: "color 0.15s ease",
          width: "100%",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = C.gold)}
        onMouseLeave={(e) => (e.currentTarget.style.color = C.charcoalLight)}
      >
        <span style={{ fontSize: "1.05rem", lineHeight: 1 }}>+</span>
        <span>{labelText}</span>
      </button>
    );
  }

  return (
    <div
      className="arca-card"
      onKeyDown={(e) => {
        if (e.key === "Escape") reset();
      }}
      style={{
        padding: "1rem 1.15rem",
        marginTop: "0.5rem",
        animation: "arca-module-in 0.18s ease",
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
        }}
        placeholder={isToday ? "今日のタスク名…" : "タスク名…"}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: "transparent",
          border: "none",
          borderBottom: `1px solid ${C.gold}`,
          outline: "none",
          fontSize: "0.875rem",
          color: C.charcoal,
          padding: "0.2rem 0",
          letterSpacing: "0.01em",
          marginBottom: "0.75rem",
        }}
      />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem" }}>
        <button
          onClick={reset}
          style={{
            background: "none",
            border: "none",
            padding: "0.35rem 0.75rem",
            fontSize: "0.75rem",
            color: C.charcoalLight,
            cursor: "pointer",
          }}
        >
          キャンセル
        </button>
        <button
          onClick={handleAdd}
          disabled={!title.trim() || saving}
          style={{
            background: title.trim() ? C.gold : "rgba(0, 0, 0, 0.06)",
            color: title.trim() ? "#FDFCFA" : C.charcoalXLight,
            border: "none",
            borderRadius: "8px",
            padding: "0.35rem 0.85rem",
            fontSize: "0.75rem",
            fontWeight: 600,
            cursor: title.trim() ? "pointer" : "default",
            transition: "all 0.15s ease",
          }}
        >
          追加
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// MonthGrid — 月間カレンダーグリッド（シフト可視化対応）
// ─────────────────────────────────────────
function MonthGrid({
  year,
  month,
  selectedDate,
  today,
  events,
  eventDates,
  taskDueDates,
  pmDates,
  settings,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: {
  year: number;
  month: number;
  selectedDate: string;
  today: string;
  events: CalendarEvent[];
  eventDates: Set<string>;
  taskDueDates: Set<string>;
  /** date → Day番号 の Map（PMタスクがある日のみ） */
  pmDates: Map<string, number>;
  settings?: PMSettings | null;
  onSelectDate: (d: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const { firstDay, daysInMonth, daysInPrev } = monthMeta(year, month);

  // 勤務・シフト予定のマップ化（手動オーバーライドも考慮）
  const shiftMap = new Map<string, { isWork: boolean; title?: string }>();
  for (const ev of events) {
    const isWork = /仕事|早番|遅番|勤務|日勤|当直|夜勤|出勤|シフト/i.test(ev.title);
    if (isWork && !shiftMap.has(ev.date)) {
      shiftMap.set(ev.date, { isWork: true, title: ev.title });
    }
  }
  if (settings?.overrides) {
    for (const [date, override] of Object.entries(settings.overrides)) {
      if ("type" in override && override.type) {
        shiftMap.set(date, {
          isWork: override.type === "work",
          title: override.shiftName,
        });
      } else if ("isRestDay" in override && override.isRestDay) {
        shiftMap.set(date, {
          isWork: false,
          title: (override as any).note,
        });
      }
    }
  }

  const cells: { dateStr: string; day: number; inMonth: boolean; isSun: boolean; isSat: boolean }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const prevM = month === 0 ? 11 : month - 1;
    const prevY = month === 0 ? year - 1 : year;
    const dayOfWeek = (firstDay - 1 - i + 7) % 7;
    cells.push({
      dateStr: toDateStr(prevY, prevM, d),
      day: d,
      inMonth: false,
      isSun: dayOfWeek === 0,
      isSat: dayOfWeek === 6,
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dayOfWeek = (firstDay + d - 1) % 7;
    cells.push({
      dateStr: toDateStr(year, month, d),
      day: d,
      inMonth: true,
      isSun: dayOfWeek === 0,
      isSat: dayOfWeek === 6,
    });
  }

  const remaining = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const nextM = month === 11 ? 0 : month + 1;
    const nextY = month === 11 ? year + 1 : year;
    const dayOfWeek = (cells.length) % 7;
    cells.push({
      dateStr: toDateStr(nextY, nextM, d),
      day: d,
      inMonth: false,
      isSun: dayOfWeek === 0,
      isSat: dayOfWeek === 6,
    });
  }

  return (
    <div className="arca-card" style={{ padding: "1.25rem 1.4rem" }}>
      {/* 月ナビゲーションヘッダー */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.1rem" }}>
        <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: C.charcoal, margin: 0, letterSpacing: "-0.01em" }}>
          {year}年 {MONTHS_JA[month]}
        </h2>
        <div style={{ display: "flex", gap: "0.25rem" }}>
          <button onClick={onPrevMonth} style={navBtnStyle} title="前月">
            <ChevronLeft />
          </button>
          <button onClick={onNextMonth} style={navBtnStyle} title="翌月">
            <ChevronRight />
          </button>
        </div>
      </div>

      {/* 曜日ヘッダー */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: "0.4rem", textAlign: "center" }}>
        {WEEKDAYS.map((w, idx) => (
          <span
            key={w}
            style={{
              fontSize: "0.68rem",
              fontWeight: 600,
              color: idx === 0 ? C.danger : idx === 6 ? "#5A7DA0" : C.charcoalLight,
              letterSpacing: "0.04em",
              paddingBottom: "0.3rem",
            }}
          >
            {w}
          </span>
        ))}
      </div>

      {/* 日付グリッド */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
        {cells.map(({ dateStr, day, inMonth, isSun, isSat }) => {
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === today;
          const hasEvent = eventDates.has(dateStr);
          const hasTask = taskDueDates.has(dateStr);
          const pmDayIndex = pmDates.get(dateStr);
          const hasPM = pmDayIndex !== undefined;

          // シフト状態
          const shift = shiftMap.get(dateStr);
          const isWork = !!shift;
          const isRest = inMonth && shiftMap.size > 0 && !isWork;

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "space-between",
                minHeight: "52px",
                padding: "0.35rem 0.15rem 0.3rem",
                background: isSelected
                  ? C.gold
                  : isToday
                  ? C.goldFaint2
                  : isRest
                  ? "rgba(82, 121, 111, 0.04)"
                  : "transparent",
                border: "none",
                borderRadius: "10px",
                cursor: "pointer",
                transition: "all 0.15s ease",
                outline: "none",
              }}
            >
              {/* 日付数字 */}
              <span
                style={{
                  fontSize: "0.82rem",
                  fontWeight: isSelected ? 750 : isToday ? 700 : 500,
                  color: isSelected
                    ? "#FDFCFA"
                    : !inMonth
                    ? C.charcoalXLight
                    : isToday
                    ? C.goldDark
                    : isSun
                    ? C.danger
                    : isSat
                    ? "#5A7DA0"
                    : C.charcoal,
                  lineHeight: 1,
                }}
              >
                {day}
              </span>

              {/* シフト（仕事/休）ミニバッジ */}
              {inMonth && shiftMap.size > 0 && (
                <div style={{ margin: "2px 0", lineHeight: 1 }}>
                  {isWork ? (
                    <span
                      style={{
                        fontSize: "0.6rem",
                        fontWeight: 650,
                        color: isSelected ? "#FDFCFA" : C.goldDark,
                        background: isSelected ? "rgba(255,255,255,0.22)" : C.goldFaint,
                        padding: "0.1rem 0.3rem",
                        borderRadius: "4px",
                        letterSpacing: "-0.02em",
                        whiteSpace: "nowrap",
                        maxWidth: "38px",
                        overflow: "hidden",
                        display: "inline-block",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {shift.title?.replace(/【Day\s*\d+】|Day\s*\d+/i, "").trim() || "勤"}
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: "0.6rem",
                        fontWeight: 650,
                        color: isSelected ? "#FDFCFA" : C.sage,
                        background: isSelected ? "rgba(255,255,255,0.22)" : "rgba(82, 121, 111, 0.12)",
                        padding: "0.1rem 0.35rem",
                        borderRadius: "4px",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      休
                    </span>
                  )}
                </div>
              )}

              {/* ドットインジケータ（予定・タスク・PM） */}
              <div style={{ display: "flex", gap: "2.5px", minHeight: "5px", alignItems: "center" }}>
                {hasEvent && (
                  <span
                    style={{
                      width: "4px",
                      height: "4px",
                      borderRadius: "50%",
                      background: isSelected ? "#FDFCFA" : C.gold,
                    }}
                    title="予定あり"
                  />
                )}
                {hasTask && (
                  <span
                    style={{
                      width: "4px",
                      height: "4px",
                      borderRadius: "50%",
                      background: isSelected ? "rgba(255,255,255,0.75)" : C.charcoalLight,
                    }}
                    title="タスク期限あり"
                  />
                )}
                {hasPM && (
                  <span
                    style={{
                      width: "4px",
                      height: "4px",
                      borderRadius: "50%",
                      background: isSelected ? "#FFF" : C.goldDark,
                    }}
                    title="PMタスクあり"
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 凡例ガイド */}
      <div
        style={{
          marginTop: "1rem",
          paddingTop: "0.75rem",
          borderTop: "1px solid rgba(0,0,0,0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.1rem",
          flexWrap: "wrap",
          fontSize: "0.72rem",
          color: C.charcoalLight,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.gold }} />
          <span>予定</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.charcoalLight }} />
          <span>タスク</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.goldDark }} />
          <span>PM</span>
        </div>
        {shiftMap.size > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 650, color: C.goldDark, background: C.goldFaint, padding: "0.05rem 0.25rem", borderRadius: "3px" }}>勤</span>
              <span>出勤</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 650, color: C.sage, background: "rgba(82, 121, 111, 0.12)", padding: "0.05rem 0.25rem", borderRadius: "3px" }}>休</span>
              <span>休日</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// スタイル定数
// ─────────────────────────────────────────
const timeInputStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  outline: "none",
  fontSize: "0.75rem",
  color: C.charcoal,
  letterSpacing: "0.02em",
  cursor: "pointer",
  fontFamily: "-apple-system, sans-serif",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.68rem",
  color: C.charcoalLight,
  letterSpacing: "0.02em",
};

const navBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: C.charcoalLight,
  padding: "0.3rem",
  borderRadius: "8px",
  lineHeight: 0,
  transition: "all 0.15s ease",
};

function iconBtnStyle(color: string): React.CSSProperties {
  return {
    background: "none",
    border: "none",
    cursor: "pointer",
    color,
    padding: "0.25rem",
    lineHeight: 0,
    borderRadius: "6px",
    transition: "color 0.15s ease",
  };
}

// ─────────────────────────────────────────
// SyncBadge — Google 同期バッジ (Calendar用)
// ─────────────────────────────────────────
function SyncBadge({
  isReady,
  isSignedIn,
  syncStatus,
  onSignIn,
  onSignOut,
  onManualSync,
}: {
  isReady: boolean;
  isSignedIn: boolean;
  syncStatus: SyncStatus;
  onSignIn: () => void;
  onSignOut: () => void;
  onManualSync: () => void;
}) {
  if (!isReady) return null;

  if (!isSignedIn) {
    return (
      <button
        onClick={onSignIn}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: "0.75rem",
          color: C.charcoalLight,
          letterSpacing: "0.02em",
          transition: "opacity 0.2s",
          padding: 0,
        }}
        title="Googleでログインしてカレンダー同期を有効にする"
      >
        <svg style={{ width: "0.85rem", height: "0.85rem" }} viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" fill={C.charcoalLight} />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill={C.charcoalLight} />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" fill={C.charcoalLight} />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill={C.charcoalLight} />
        </svg>
        Google同期
      </button>
    );
  }

  const statusLabel =
    syncStatus === "syncing" ? "同期中…" :
    syncStatus === "done" ? "同期完了" :
    syncStatus === "error" ? "同期エラー" :
    "Google同期有効";

  const statusColor =
    syncStatus === "syncing" ? C.gold :
    syncStatus === "done" ? C.sage :
    syncStatus === "error" ? C.danger :
    C.gold;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        {syncStatus === "syncing" && (
          <svg
            style={{ width: "0.75rem", height: "0.75rem", animation: "spin 1s linear infinite" }}
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.gold}
            strokeWidth={2.5}
          >
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        )}
        <span style={{ fontSize: "0.72rem", color: statusColor, fontWeight: 500, letterSpacing: "0.02em" }}>
          {statusLabel}
        </span>
        <button
          onClick={onManualSync}
          disabled={syncStatus === "syncing"}
          style={{
            background: "none",
            border: "none",
            cursor: syncStatus === "syncing" ? "default" : "pointer",
            padding: "0.15rem",
            color: C.charcoalLight,
            display: "inline-flex",
            alignItems: "center",
            opacity: syncStatus === "syncing" ? 0.4 : 1,
            transition: "color 0.15s ease",
          }}
          title="今すぐカレンダーを手動同期"
          onMouseEnter={(e) => (e.currentTarget.style.color = C.gold)}
          onMouseLeave={(e) => (e.currentTarget.style.color = C.charcoalLight)}
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" style={{ width: "0.75rem", height: "0.75rem" }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
      </div>
      <button
        onClick={onSignOut}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: "0.68rem",
          color: C.charcoalXLight,
          padding: 0,
        }}
      >
        ログアウト
      </button>
    </div>
  );
}

// ─────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────
export default function Calendar() {
  const today = todayStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  // PM ステート
  const [pmSettings, setPmSettings] = useState<PMSettings | null>(null);
  const [pmTemplates, setPmTemplates] = useState<PMTemplateItem[]>([]);
  const [pmLogs, setPmLogs] = useState<PMLogItem[]>([]);
  const [showShiftOverrideModal, setShowShiftOverrideModal] = useState(false);

  const { isReady, isSignedIn, accessToken, signIn, signOut } = useGoogleAuth();
  const { toast, showUndoToast, showMessageToast, dismissToast, triggerUndo } = useUndoToast<CalendarEvent>();

  // ── Firestore: events リアルタイム購読 ──
  useEffect(() => {
    const q = query(collection(db, "events"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      setEvents(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CalendarEvent, "id">),
        }))
      );
    });
  }, []);

  // ── Firestore: PM 設定・テンプレート・ログ 購読 ──
  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, "pm_settings", "main"), (snap) => {
      if (snap?.exists?.()) {
        setPmSettings(snap.data() as PMSettings);
      } else {
        // フォールバック: config
        getDoc(doc(db, "pm_settings", "config")).then((cSnap) => {
          if (cSnap?.exists?.()) setPmSettings(cSnap.data() as PMSettings);
        });
      }
    });

    const unsubTemplates = onSnapshot(
      query(collection(db, "pm_templates"), orderBy("dayIndex", "asc")),
      (snap) => setPmTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PMTemplateItem)))
    );

    const unsubLogs = onSnapshot(
      query(collection(db, "pm_logs"), where("date", "==", selectedDate)),
      (snap) => setPmLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PMLogItem)))
    );

    return () => {
      unsubSettings();
      unsubTemplates();
      unsubLogs();
    };
  }, [selectedDate]);

  // ── Google Calendar 双方向同期（マイカレンダー限定） ──
  const syncCalendar = useCallback(async () => {
    if (!isSignedIn || !accessToken) return;
    try {
      setSyncStatus("syncing");
      await syncGoogleCalendarToArca(accessToken, events.length > 0 ? events : undefined);
      setSyncStatus("done");
      setTimeout(() => {
        setSyncStatus("idle");
      }, 3000);
    } catch (err) {
      console.error("Google Calendar sync error:", err);
      setSyncStatus("error");
    }
  }, [isSignedIn, accessToken, events]);

  // 初回マウント時・認証完了時に自動同期
  useEffect(() => {
    if (isSignedIn && accessToken) {
      syncCalendar();
    }
  }, [isSignedIn, accessToken]);

  // ── Firestore: tasks リアルタイム購読 ──
  useEffect(() => {
    const q = query(collection(db, "tasks"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      setTasks(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Task, "id">),
        }))
      );
    });
  }, []);

  // ── 選択日のフィルタリング ──
  const dayEvents = events.filter((e) => e.date === selectedDate);
  const dayTasks = tasks.filter((t) => t.dueDate === selectedDate);
  const isSelectedToday = selectedDate === today;

  // ── カレンダー用のドットセット ──
  const eventDates = new Set(events.map((e) => e.date));
  const taskDueDates = new Set(tasks.filter((t) => t.dueDate).map((t) => t.dueDate as string));

  // ── PM 日付マップ（表示中の月の前後1ヶ月を含む範囲） ──
  const pmDates = (() => {
    if (!pmSettings) return new Map<string, number>();
    const y = viewYear;
    const m = viewMonth;
    const fromDate = `${y}-${String(m === 0 ? 12 : m).padStart(2, "0")}-01`;
    const toYear = m === 11 ? y + 1 : y;
    const toMonth = m === 11 ? 0 : m + 1;
    const toDate = `${toYear}-${String(toMonth + 1).padStart(2, "0")}-${String(new Date(toYear, toMonth + 1, 0).getDate()).padStart(2, "0")}`;
    return buildCalendarPMDates(pmSettings, pmTemplates, fromDate, toDate);
  })();

  // ── 選択日のシフト情報（手動オーバーライド優先） ──
  const selectedShift = resolveShiftInfo(selectedDate, events, pmSettings);
  const selectedShiftInfo = resolveDateShiftInfo(selectedDate, events, pmSettings);

  // ── 選択日の PM 情報（シフト連動タスク抽出） ──
  const selectedDatePMItems = pmSettings
    ? getActivePMTasksForDate(selectedDate, pmTemplates, events, pmSettings)
    : [];
  const pmLogMap = buildLogMapForDate(pmLogs, selectedDate);

  // ── シフト手動オーバーライド保存（楽観的即時反映） ──
  const handleSaveShiftOverride = useCallback(
    async (override: any) => {
      // 1. ローカルステートを即時楽観的更新（0ms 反映）
      setPmSettings((prev) => {
        const current = prev || { ...DEFAULT_PM_SETTINGS };
        const newOverrides = { ...(current.overrides || {}) };
        if (override === null) {
          delete newOverrides[selectedDate];
        } else {
          newOverrides[selectedDate] = {
            date: selectedDate,
            type: override.type,
            streakNumber: override.streakNumber,
            shiftName: override.shiftName,
            updatedAt: new Date().toISOString(),
          };
        }
        return { ...current, overrides: newOverrides };
      });

      // 2. 永続化保存
      try {
        await saveShiftOverride(selectedDate, override);
        showMessageToast(override ? "シフト状態を手動設定しました" : "シフト状態を自動判定に戻しました");
      } catch (err) {
        console.error("Failed to save shift override from calendar:", err);
      }
    },
    [selectedDate, showMessageToast]
  );

  // ── PM 完了トグル ──
  const handleTogglePMComplete = useCallback(async (item: PMTemplateItem) => {
    const currentStatus = resolveItemStatus(item, pmLogMap);
    if (currentStatus === "completed") return;

    try {
      await recordPMLog({
        date: selectedDate,
        templateId: item.id,
        dayIndex: item.dayIndex || selectedShift.streakNumber || 1,
        title: item.title,
        status: "completed",
      });
      showMessageToast(`PM「${item.title}」を完了にしました`);
    } catch (err) {
      console.error("Failed to record PM log from calendar", err);
    }
  }, [selectedDate, selectedShift.streakNumber, pmLogMap, showMessageToast]);


  // ── 予定追加（Google Calendar 連動） ──
  const handleAddEvent = useCallback(async (data: {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    note: string;
  }) => {
    let googleEventId: string | undefined;
    if (isSignedIn && accessToken) {
      try {
        googleEventId = await createGoogleCalendarEvent(accessToken, data);
      } catch (gErr) {
        console.error("Failed to push event to Google Calendar:", gErr);
      }
    }

    await addDoc(collection(db, "events"), {
      ...data,
      googleEventId: googleEventId || null,
      createdAt: serverTimestamp(),
    });
  }, [isSignedIn, accessToken]);

  // ── タスク追加（選択日 / 今日 を期限として保存） ──
  const handleAddTask = useCallback(async (title: string, dueDate: string) => {
    try {
      await addDoc(collection(db, "tasks"), {
        title,
        dueDate,
        completed: false,
        createdAt: serverTimestamp(),
      });
      showMessageToast(`タスク「${title}」を追加しました`);
    } catch (e) {
      console.error("Failed to add task from calendar", e);
      showMessageToast("タスクの追加に失敗しました");
    }
  }, [showMessageToast]);

  // ── 予定削除（Undo対応 & Google Calendar 連動） ──
  const handleDeleteEvent = useCallback(async (event: CalendarEvent) => {
    try {
      if (isSignedIn && accessToken && event.googleEventId) {
        try {
          await deleteGoogleCalendarEvent(accessToken, event.googleEventId);
        } catch (gErr) {
          console.error("Failed to delete event from Google Calendar:", gErr);
        }
      }

      await deleteDoc(doc(db, "events", event.id));

      showUndoToast({
        message: `予定「${event.title}」を削除しました`,
        item: event,
        onUndo: async (restoredEvent) => {
          let newGId: string | undefined;
          if (isSignedIn && accessToken) {
            try {
              newGId = await createGoogleCalendarEvent(accessToken, {
                title: restoredEvent.title,
                date: restoredEvent.date,
                startTime: restoredEvent.startTime,
                endTime: restoredEvent.endTime,
                note: restoredEvent.note,
              });
            } catch (gErr) {
              console.error("Failed to restore event to Google Calendar:", gErr);
            }
          }

          await addDoc(collection(db, "events"), {
            title: restoredEvent.title,
            date: restoredEvent.date,
            startTime: restoredEvent.startTime || "",
            endTime: restoredEvent.endTime || "",
            note: restoredEvent.note || "",
            googleEventId: newGId || null,
            createdAt: serverTimestamp(),
          });
        },
      });
    } catch (e) {
      console.error("Delete event failed", e);
    }
  }, [isSignedIn, accessToken, showUndoToast]);

  // ── 予定更新（Google Calendar 連動） ──
  const handleUpdateEvent = useCallback(async (
    id: string,
    data: Partial<Omit<CalendarEvent, "id" | "createdAt">>
  ) => {
    const existing = events.find((e) => e.id === id);
    if (isSignedIn && accessToken && existing?.googleEventId) {
      try {
        await updateGoogleCalendarEvent(accessToken, existing.googleEventId, {
          title: data.title !== undefined ? data.title : existing.title,
          date: data.date !== undefined ? data.date : existing.date,
          startTime: data.startTime !== undefined ? data.startTime : existing.startTime,
          endTime: data.endTime !== undefined ? data.endTime : existing.endTime,
          note: data.note !== undefined ? data.note : existing.note,
        });
      } catch (gErr) {
        console.error("Failed to update event on Google Calendar:", gErr);
      }
    }

    await updateDoc(doc(db, "events", id), data);
  }, [isSignedIn, accessToken, events]);

  // ── 月ナビゲーション ──
  const goPrevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const goNextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  // ── 選択日の表示ラベル（「今日」「Today」は含めず日付曜日のみ表示） ──
  const selectedFullLabel = (() => {
    const d = new Date(`${selectedDate}T00:00:00`);
    return d.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
  })();

  return (
    <div className="w-full max-w-5xl mx-auto" style={{ padding: "2.8rem 1.5rem 6rem", boxSizing: "border-box" }}>
      
      {/* ─── ヘッダー（統一された静かなデザイン） ─── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.75rem", padding: "0 0.25rem" }}>
        <div>
          <p style={{ fontSize: "0.68rem", fontWeight: 650, color: C.charcoalLight, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>
            CALENDAR
          </p>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 750, color: C.charcoal, margin: "0.15rem 0 0", letterSpacing: "-0.03em" }}>
            カレンダー
          </h1>
          <p style={{ fontSize: "0.78rem", color: C.charcoalLight, margin: "0.3rem 0 0", letterSpacing: "0.01em" }}>
            予定・タスク・PM（予防保全）の統合ビュー
          </p>
        </div>

        <SyncBadge
          isReady={isReady}
          isSignedIn={isSignedIn}
          syncStatus={syncStatus}
          onSignIn={signIn}
          onSignOut={signOut}
          onManualSync={syncCalendar}
        />
      </div>

      {/* ─── 選択日ステータスバー（日付の横に休日/出勤ボタンを横並び配置） ─── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "1.25rem",
          padding: "0 0.35rem",
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: C.charcoal, margin: 0, letterSpacing: "-0.015em" }}>
          {selectedFullLabel}
        </h2>

        {/* シフト状態バッジ（クリックで出勤ステータス確認モーダル） */}
        <button
          type="button"
          onClick={() => setShowShiftOverrideModal(true)}
          data-testid="calendar-shift-badge"
          style={{
            fontSize: "0.72rem",
            fontWeight: 650,
            color: selectedShift.type === "holiday" ? C.sage : C.goldDark,
            background: selectedShift.type === "holiday" ? "rgba(82, 121, 111, 0.10)" : C.goldFaint,
            border: selectedShift.isOverridden
              ? `1px dashed ${selectedShift.type === "holiday" ? C.sage : C.gold}`
              : "1px solid transparent",
            padding: "0.22rem 0.75rem",
            borderRadius: "9999px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            transition: "all 0.15s ease",
            boxShadow: "0 1px 4px rgba(0,0,0,0.02)",
          }}
          title="クリックして出勤ステータス確認・手動調整"
        >
          <span>
            {selectedShift.type === "holiday"
              ? `🌙 休日 ${selectedShift.streakNumber}日目`
              : `✦ 出勤 ${selectedShift.streakNumber}日目${selectedShift.shiftName ? ` (${selectedShift.shiftName})` : ""}`}
          </span>
          {selectedShift.isOverridden && (
            <span style={{ fontSize: "0.62rem", opacity: 0.85 }}>(手動)</span>
          )}
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" style={{ width: "0.68rem", height: "0.68rem", opacity: 0.7 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
          </svg>
        </button>
      </div>

      {/* ─── 左右2ペイン（PC: 2カラム横並び / モバイル: 縦積み） ─── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        
        {/* 左ペイン: 月間カレンダー */}
        <div className="md:col-span-7">
          <MonthGrid
            year={viewYear}
            month={viewMonth}
            selectedDate={selectedDate}
            today={today}
            events={events}
            eventDates={eventDates}
            taskDueDates={taskDueDates}
            pmDates={pmDates}
            settings={pmSettings}
            onSelectDate={setSelectedDate}
            onPrevMonth={goPrevMonth}
            onNextMonth={goNextMonth}
          />
        </div>

        {/* 右ペイン: 日別詳細パネル（予定・タスク・PM） */}
        <div
          key={selectedDate}
          className="md:col-span-5 flex flex-col gap-4"
          style={{ animation: "arca-module-in 0.22s ease" }}
        >
          {/* ── 予定セクション ── */}
          <div className="arca-card" style={{ padding: "1.15rem 1.4rem" }}>
            <p style={sectionLabelStyle}>予定</p>

            {dayEvents.length === 0 ? (
              <p style={emptyStyle}>予定はありません</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {dayEvents.map((ev) => (
                  <EventRow
                    key={ev.id}
                    event={ev}
                    onDelete={handleDeleteEvent}
                    onUpdate={handleUpdateEvent}
                  />
                ))}
              </ul>
            )}

            {/* 予定追加フォーム */}
            <div style={{ marginTop: "0.4rem" }}>
              <AddEventForm selectedDate={selectedDate} onAdd={handleAddEvent} />
            </div>
          </div>

          {/* ── タスク期限セクション ── */}
          <div className="arca-card" style={{ padding: "1.15rem 1.4rem" }}>
            <p style={sectionLabelStyle}>タスク期限</p>

            {dayTasks.length === 0 ? (
              <p style={emptyStyle}>期限のタスクはありません</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {dayTasks.map((task) => (
                  <TaskDueRow key={task.id} task={task} />
                ))}
              </ul>
            )}

            {/* タスク追加フォーム（選択日 / 今日を期限として追加） */}
            <div style={{ marginTop: "0.4rem" }}>
              <AddTaskForm
                selectedDate={selectedDate}
                isToday={isSelectedToday}
                onAdd={handleAddTask}
              />
            </div>
          </div>

          {/* ── PM（予防保全）セクション ── */}
          {selectedDatePMItems.length > 0 && (
            <div className="arca-card" style={{ padding: "1.15rem 1.4rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <span style={{ fontSize: "0.75rem", color: C.gold }}>✦</span>
                  <p style={{ ...sectionLabelStyle, margin: 0 }}>予防保全（PM）計画</p>
                </div>
                <span
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    color: selectedShiftInfo.isRestDay ? C.sage : C.goldDark,
                    background: selectedShiftInfo.isRestDay ? "rgba(82, 121, 111, 0.10)" : C.goldFaint,
                    padding: "0.15rem 0.5rem",
                    borderRadius: "9999px",
                    letterSpacing: "0.03em",
                  }}
                  data-testid="calendar-pm-day-badge"
                >
                  {selectedShiftInfo.isRestDay ? "休日PM" : "出勤PM"}
                </span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {selectedDatePMItems.map((item) => {
                  const status = resolveItemStatus(item, pmLogMap);
                  const isDone = status === "completed";
                  const isSkip = status === "skipped";

                  return (
                    <li
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.75rem",
                        padding: "0.6rem 0",
                        borderBottom: "1px solid rgba(0,0,0,0.035)",
                        opacity: isDone || isSkip ? 0.6 : 1,
                        transition: "opacity 0.2s ease",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleTogglePMComplete(item)}
                        disabled={isDone || isSkip}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: isDone || isSkip ? "default" : "pointer",
                          lineHeight: 0,
                          marginTop: "2px",
                        }}
                        title={isDone ? "完了済み" : "完了にする"}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          strokeWidth={1.75}
                          style={{
                            width: "1.15rem",
                            height: "1.15rem",
                            stroke: isDone ? C.gold : C.charcoalXLight,
                            transition: "stroke 0.2s ease",
                            flexShrink: 0,
                          }}
                        >
                          {isDone ? (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                          ) : (
                            <circle cx="12" cy="12" r="9" />
                          )}
                        </svg>
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.875rem",
                            fontWeight: 500,
                            color: isDone ? C.charcoalLight : C.charcoal,
                            textDecoration: isDone ? "line-through" : "none",
                          }}
                        >
                          {item.title}
                        </p>
                        {item.content && (
                          <p style={{ margin: "0.15rem 0 0", fontSize: "0.74rem", color: C.charcoalLight }}>{item.content}</p>
                        )}
                        {isSkip && (
                          <span style={{ fontSize: "0.68rem", color: C.charcoalLight, fontStyle: "italic", marginTop: "0.15rem", display: "inline-block" }}>
                            スキップ済
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

        </div>
      </div>

      {/* ─── 出勤ステータス確認 & 手動調整モーダル ─── */}
      <PMShiftOverrideModal
        isOpen={showShiftOverrideModal}
        targetDate={selectedDate}
        currentShift={selectedShift}
        events={events}
        googleSyncStatus={syncStatus}
        isGoogleSignedIn={isSignedIn}
        onGoogleSignIn={signIn}
        onGoogleSync={syncCalendar}
        onClose={() => setShowShiftOverrideModal(false)}
        onSave={handleSaveShiftOverride}
      />

      {/* ─── 共通 Undo トースト ─── */}
      <UndoToast toast={toast} onUndo={triggerUndo} onDismiss={dismissToast} />
    </div>
  );
}

// ─────────────────────────────────────────
// セクションラベル・空表示スタイル定数
// ─────────────────────────────────────────
const sectionLabelStyle: React.CSSProperties = {
  fontSize: "0.68rem",
  fontWeight: 650,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: C.charcoalLight,
  margin: "0 0 0.65rem",
};

const emptyStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  color: C.charcoalLight,
  margin: "0.5rem 0",
  letterSpacing: "0.01em",
  fontWeight: 400,
};

