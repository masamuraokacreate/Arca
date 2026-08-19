/**
 * src/components/Calendar.tsx
 * Arca — Calendar / カレンダー (Apple HIG × Arca 準拠)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { CalendarEvent, CalendarTask } from "../types";
import { C } from "../lib/designSystem";
import { useUndoToast } from "../hooks/useUndoToast";
import { UndoToast } from "./common/UndoToast";

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
  const titleRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setEditTitle(event.title);
    setEditStart(event.startTime);
    setEditEnd(event.endTime);
    setEditNote(event.note);
    setEditing(true);
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = async () => {
    if (!editTitle.trim()) return;
    await onUpdate(event.id, {
      title: editTitle.trim(),
      startTime: editStart,
      endTime: editEnd,
      note: editNote,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <li
        style={{
          padding: "0.85rem 0",
          borderBottom: "1px solid rgba(0, 0, 0, 0.035)",
          animation: "arca-module-in 0.15s ease",
        }}
      >
        {/* タイトル編集 */}
        <input
          ref={titleRef}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveEdit();
            if (e.key === "Escape") cancelEdit();
          }}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            borderBottom: `1px solid ${C.gold}`,
            outline: "none",
            fontSize: "0.875rem",
            color: C.charcoal,
            paddingBottom: "0.25rem",
            marginBottom: "0.6rem",
          }}
        />
        {/* 時刻 */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.68rem", color: C.charcoalLight }}>開始</span>
          <input
            type="time"
            value={editStart}
            onChange={(e) => setEditStart(e.target.value)}
            style={timeInputStyle}
          />
          <span style={{ fontSize: "0.68rem", color: C.charcoalLight }}>終了</span>
          <input
            type="time"
            value={editEnd}
            onChange={(e) => setEditEnd(e.target.value)}
            style={timeInputStyle}
          />
        </div>
        {/* メモ */}
        <input
          type="text"
          value={editNote}
          onChange={(e) => setEditNote(e.target.value)}
          placeholder="メモ（任意）"
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
            outline: "none",
            fontSize: "0.75rem",
            color: C.charcoal,
            paddingBottom: "0.2rem",
            marginBottom: "0.7rem",
          }}
        />
        {/* 保存 / キャンセル */}
        <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
          <button onClick={cancelEdit} style={iconBtnStyle(C.charcoalLight)} title="キャンセル">
            <XIcon />
          </button>
          <button onClick={saveEdit} style={iconBtnStyle(C.gold)} title="保存">
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
      {/* タイムライン的な左アクセント */}
      <div
        style={{
          width: "2.5px",
          minHeight: "1.2rem",
          height: "100%",
          background: C.gold,
          borderRadius: "9999px",
          flexShrink: 0,
          alignSelf: "stretch",
          marginTop: "0.15rem",
        }}
      />

      {/* 本文 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: "0.875rem",
            fontWeight: 450,
            color: C.charcoal,
            letterSpacing: "0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {event.title}
        </p>
        {(event.startTime || event.note) && (
          <p
            style={{
              margin: "0.2rem 0 0",
              fontSize: "0.72rem",
              color: C.charcoalLight,
              letterSpacing: "0.02em",
            }}
          >
            {event.startTime && (
              <span>{event.startTime}{event.endTime ? ` – ${event.endTime}` : ""}</span>
            )}
            {event.startTime && event.note && <span style={{ margin: "0 0.3rem" }}>·</span>}
            {event.note && <span>{event.note}</span>}
          </p>
        )}
      </div>

      {/* アクションボタン（ホバー時のみ） */}
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s ease",
          flexShrink: 0,
        }}
      >
        <button onClick={startEdit} style={iconBtnStyle(C.charcoalLight)} title="編集" data-testid="event-edit-btn">
          <PencilIcon />
        </button>
        <button onClick={() => onDelete(event)} style={iconBtnStyle(C.charcoalLight)} title="削除" data-testid="event-delete-btn">
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────
// TaskDueRow — タスク期限行（読み取り専用）
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
      {/* タスク左アクセント（グレー：予定のゴールドと優しく区別） */}
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
      if (e.key === "Escape") {
        reset();
      }
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
      {/* タイトル */}
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
          if (e.key === "Escape") reset();
        }}
        placeholder="予定のタイトル…"
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          borderBottom: `1px solid ${C.gold}`,
          outline: "none",
          fontSize: "0.875rem",
          color: C.charcoal,
          paddingBottom: "0.4rem",
          marginBottom: "0.75rem",
          boxSizing: "border-box",
        }}
      />
      {/* 時刻 */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
        <label style={labelStyle}>開始</label>
        <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={timeInputStyle} />
        <label style={labelStyle}>終了</label>
        <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={timeInputStyle} />
      </div>
      {/* メモ */}
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="メモ（任意）"
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
          outline: "none",
          fontSize: "0.75rem",
          color: C.charcoal,
          paddingBottom: "0.3rem",
          marginBottom: "0.85rem",
          boxSizing: "border-box",
        }}
      />
      {/* アクション */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
        <button
          onClick={reset}
          style={{
            background: "none",
            border: "none",
            fontSize: "0.72rem",
            color: C.charcoalLight,
            cursor: "pointer",
            letterSpacing: "0.02em",
            padding: "0.25rem 0.5rem",
          }}
        >
          キャンセル
        </button>
        <button
          onClick={handleAdd}
          disabled={saving || !title.trim()}
          style={{
            background: title.trim() ? C.gold : "rgba(0, 0, 0, 0.06)",
            color: title.trim() ? "#FDFCFA" : C.charcoalXLight,
            border: "none",
            borderRadius: "8px",
            fontSize: "0.72rem",
            fontWeight: 600,
            cursor: title.trim() ? "pointer" : "default",
            transition: "all 0.15s ease",
            padding: "0.3rem 0.8rem",
          }}
        >
          {saving ? "…" : "追加"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// MonthGrid — カレンダーグリッド
// ─────────────────────────────────────────
function MonthGrid({
  year,
  month,
  selectedDate,
  today,
  eventDates,
  taskDueDates,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: {
  year: number;
  month: number;
  selectedDate: string;
  today: string;
  eventDates: Set<string>;
  taskDueDates: Set<string>;
  onSelectDate: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const { firstDay, daysInMonth, daysInPrev } = monthMeta(year, month);

  // 42セル（6週）分の日付情報を生成
  const cells: { dateStr: string; day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const offset = i - firstDay;
    if (offset < 0) {
      const d = daysInPrev + offset + 1;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      cells.push({ dateStr: toDateStr(prevYear, prevMonth, d), day: d, inMonth: false });
    } else if (offset < daysInMonth) {
      cells.push({ dateStr: toDateStr(year, month, offset + 1), day: offset + 1, inMonth: true });
    } else {
      const d = offset - daysInMonth + 1;
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      cells.push({ dateStr: toDateStr(nextYear, nextMonth, d), day: d, inMonth: false });
    }
  }

  return (
    <div
      className="arca-card"
      style={{
        padding: "1.5rem",
      }}
    >
      {/* 月ナビゲーション */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <button onClick={onPrevMonth} style={navBtnStyle} title="前月">
          <ChevronLeft />
        </button>
        <span
          style={{
            fontSize: "0.92rem",
            fontWeight: 650,
            letterSpacing: "0.02em",
            color: C.charcoal,
          }}
        >
          {year}年 {MONTHS_JA[month]}
        </span>
        <button onClick={onNextMonth} style={navBtnStyle} title="翌月">
          <ChevronRight />
        </button>
      </div>

      {/* 曜日ヘッダー */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: "0.4rem" }}>
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            style={{
              textAlign: "center",
              fontSize: "0.68rem",
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: i === 0 ? C.danger : i === 6 ? "#5A7DA0" : C.charcoalLight,
              paddingBottom: "0.5rem",
            }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "3px" }}>
        {cells.map(({ dateStr, day, inMonth }, idx) => {
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const hasEvent = eventDates.has(dateStr);
          const hasTask = taskDueDates.has(dateStr);
          const isSun = idx % 7 === 0;
          const isSat = idx % 7 === 6;

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "0.5rem 0.2rem 0.55rem",
                background: isSelected
                  ? C.gold
                  : isToday
                  ? C.goldFaint2
                  : "transparent",
                border: "none",
                borderRadius: "10px",
                cursor: "pointer",
                transition: "all 0.15s ease",
                outline: "none",
              }}
              onMouseEnter={(e) => {
                if (!isSelected && !isToday) {
                  e.currentTarget.style.background = "rgba(0, 0, 0, 0.04)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected && !isToday) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {/* 日付数字 */}
              <span
                style={{
                  fontSize: "0.82rem",
                  fontWeight: isSelected ? 700 : isToday ? 650 : 400,
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

              {/* イベント・タスクドット */}
              {(hasEvent || hasTask) && (
                <div style={{ position: "absolute", bottom: "3px", display: "flex", gap: "2px" }}>
                  {hasEvent && (
                    <span
                      style={{
                        width: "4px",
                        height: "4px",
                        borderRadius: "50%",
                        background: isSelected ? "#FDFCFA" : C.gold,
                      }}
                    />
                  )}
                  {hasTask && (
                    <span
                      style={{
                        width: "4px",
                        height: "4px",
                        borderRadius: "50%",
                        background: isSelected ? "rgba(255,255,255,0.7)" : C.charcoalLight,
                      }}
                    />
                  )}
                </div>
              )}
            </button>
          );
        })}
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
// メインコンポーネント
// ─────────────────────────────────────────
export default function Calendar() {
  const today = todayStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const { toast, showUndoToast, dismissToast, triggerUndo } = useUndoToast<CalendarEvent>();

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

  // ── Firestore: tasks リアルタイム購読（読み取り専用） ──
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

  // ── カレンダー用のドットセット ──
  const eventDates = new Set(events.map((e) => e.date));
  const taskDueDates = new Set(tasks.filter((t) => t.dueDate).map((t) => t.dueDate as string));

  // ── 予定追加 ──
  const handleAddEvent = useCallback(async (data: {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    note: string;
  }) => {
    await addDoc(collection(db, "events"), {
      ...data,
      createdAt: serverTimestamp(),
    });
  }, []);

  // ── 予定削除（Undo対応） ──
  const handleDeleteEvent = useCallback(async (event: CalendarEvent) => {
    try {
      await deleteDoc(doc(db, "events", event.id));

      showUndoToast({
        message: `予定「${event.title}」を削除しました`,
        item: event,
        onUndo: async (restoredEvent) => {
          await addDoc(collection(db, "events"), {
            title: restoredEvent.title,
            date: restoredEvent.date,
            startTime: restoredEvent.startTime || "",
            endTime: restoredEvent.endTime || "",
            note: restoredEvent.note || "",
            createdAt: serverTimestamp(),
          });
        },
      });
    } catch (e) {
      console.error("Delete event failed", e);
    }
  }, [showUndoToast]);

  // ── 予定更新 ──
  const handleUpdateEvent = useCallback(async (
    id: string,
    data: Partial<Omit<CalendarEvent, "id" | "createdAt">>
  ) => {
    await updateDoc(doc(db, "events", id), data);
  }, []);

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

  // ── 選択日の表示ラベル ──
  const selectedLabel = (() => {
    const d = new Date(`${selectedDate}T00:00:00`);
    if (selectedDate === today) return "今日";
    return d.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
  })();

  return (
    <div className="w-full max-w-xl mx-auto" style={{ padding: "2.8rem 1.5rem 6rem", boxSizing: "border-box" }}>
      
      {/* ─── ヘッダー ─── */}
      <div style={{ marginBottom: "2rem", padding: "0 0.25rem" }}>
        <p style={{
          fontSize: "0.68rem",
          fontWeight: 600,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: C.gold,
          marginBottom: "0.4rem",
        }}>
          Arca / Calendar
        </p>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 750, color: C.charcoal, margin: 0, letterSpacing: "-0.03em" }}>
          カレンダー
        </h1>
        <p style={{ fontSize: "0.78rem", color: C.charcoalLight, margin: "0.3rem 0 0", letterSpacing: "0.01em" }}>
          予定とタスク期限の統合ビュー
        </p>
      </div>

      {/* ─── 月間グリッド ─── */}
      <MonthGrid
        year={viewYear}
        month={viewMonth}
        selectedDate={selectedDate}
        today={today}
        eventDates={eventDates}
        taskDueDates={taskDueDates}
        onSelectDate={setSelectedDate}
        onPrevMonth={goPrevMonth}
        onNextMonth={goNextMonth}
      />

      {/* ─── 日別詳細パネル ─── */}
      <div
        key={selectedDate}
        style={{
          marginTop: "2.2rem",
          animation: "arca-module-in 0.22s ease",
        }}
      >
        {/* 日付ラベル */}
        <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.6rem", padding: "0 0.25rem" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 650, color: C.charcoal, margin: 0, letterSpacing: "-0.015em" }}>
            {selectedLabel}
          </h2>
          {selectedDate === today && (
            <span
              style={{
                fontSize: "0.65rem",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: C.gold,
                background: C.goldFaint2,
                padding: "0.15rem 0.5rem",
                borderRadius: "9999px",
              }}
            >
              Today
            </span>
          )}
        </div>

        {/* ── 予定セクション ── */}
        <div className="arca-card" style={{ padding: "1.15rem 1.4rem", marginBottom: dayTasks.length > 0 ? "1.5rem" : 0 }}>
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

          {/* 追加フォーム */}
          <div style={{ marginTop: "0.4rem" }}>
            <AddEventForm selectedDate={selectedDate} onAdd={handleAddEvent} />
          </div>
        </div>

        {/* ── タスク期限セクション（あれば表示） ── */}
        {dayTasks.length > 0 && (
          <div className="arca-card" style={{ padding: "1.15rem 1.4rem", marginTop: "1.2rem" }}>
            <p style={sectionLabelStyle}>タスク期限</p>

            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {dayTasks.map((task) => (
                <TaskDueRow key={task.id} task={task} />
              ))}
            </ul>
          </div>
        )}
      </div>

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
