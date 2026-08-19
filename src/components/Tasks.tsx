/**
 * src/components/Tasks.tsx
 * Arca — Tasks / タスク管理 (Apple HIG × Arca 準拠)
 */

import { useState, useEffect, useRef, useCallback } from "react";
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
import type { TaskItem } from "../types";
import { C } from "../lib/designSystem";
import { useUndoToast } from "../hooks/useUndoToast";
import { UndoToast } from "./common/UndoToast";

type Task = TaskItem;

// ---------- ユーティリティ ----------

/** "YYYY-MM-DD" → ロケール表示文字列 */
function formatDue(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "今日";
  if (diff === 1) return "明日";
  if (diff === -1) return "昨日";
  return d.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

/** 期限の緊急度カラー */
function dueColor(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return C.danger;       // 期限超過
  if (diff === 0) return C.gold;      // 今日
  if (diff <= 2) return C.goldDark;   // 近日
  return C.charcoalLight;             // 余裕あり
}

// ---------- アイコン ----------
function CheckCircle({ completed }: { completed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.75}
      style={{
        width: "1.25rem",
        height: "1.25rem",
        stroke: completed ? C.gold : C.charcoalXLight,
        transition: "stroke 0.25s ease, transform 0.15s ease",
        flexShrink: 0,
      }}
    >
      {completed ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      ) : (
        <circle cx="12" cy="12" r="9" />
      )}
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.75}
      stroke="currentColor"
      style={{ width: "0.95rem", height: "0.95rem" }}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
      />
    </svg>
  );
}

// ---------- タスク行 ----------
function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.85rem",
        padding: "0.75rem 0",
        borderBottom: "1px solid rgba(0, 0, 0, 0.035)",
        opacity: task.completed ? 0.45 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      {/* チェックボタン */}
      <button
        onClick={() => onToggle(task)}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", lineHeight: 0 }}
        title={task.completed ? "未完了に戻す" : "完了にする"}
      >
        <CheckCircle completed={task.completed} />
      </button>

      {/* タスク名 */}
      <span
        style={{
          flex: 1,
          fontSize: "0.875rem",
          fontWeight: 400,
          color: task.completed ? C.charcoalLight : C.charcoal,
          textDecoration: task.completed ? "line-through" : "none",
          transition: "text-decoration 0.2s ease",
          letterSpacing: "0.01em",
        }}
      >
        {task.title}
      </span>

      {/* 期限バッジ（テキスト階層で表現） */}
      {task.dueDate && !task.completed && (
        <span
          style={{
            fontSize: "0.72rem",
            letterSpacing: "0.02em",
            fontWeight: 500,
            color: dueColor(task.dueDate),
            flexShrink: 0,
            padding: "0.15rem 0.45rem",
            borderRadius: "6px",
            background: "rgba(0, 0, 0, 0.03)",
          }}
        >
          {formatDue(task.dueDate)}
        </span>
      )}

      {/* 削除ボタン */}
      <button
        onClick={() => onDelete(task)}
        style={{
          background: "none",
          border: "none",
          padding: "0.2rem",
          cursor: "pointer",
          color: C.charcoalLight,
          lineHeight: 0,
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s ease",
          flexShrink: 0,
        }}
        title="削除"
      >
        <TrashIcon />
      </button>
    </li>
  );
}

// ---------- メインコンポーネント ----------
export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [titleInput, setTitleInput] = useState("");
  const [dueInput, setDueInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const { toast, showUndoToast, dismissToast, triggerUndo } = useUndoToast<Task>();

  // ---------- Firestore リアルタイム購読 ----------
  useEffect(() => {
    const q = query(collection(db, "tasks"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) => {
      setTasks(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Task, "id">),
        }))
      );
    });
  }, []);

  // ---------- タスク追加 ----------
  const handleAdd = useCallback(async () => {
    const trimmed = titleInput.trim();
    if (!trimmed || isAdding) return;

    setIsAdding(true);
    try {
      await addDoc(collection(db, "tasks"), {
        title: trimmed,
        dueDate: dueInput || null,
        completed: false,
        createdAt: serverTimestamp(),
      });
      setTitleInput("");
      setDueInput("");
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      setIsAdding(false);
    }
  }, [titleInput, dueInput, isAdding]);

  // ---------- 完了トグル ----------
  const handleToggle = useCallback(async (task: Task) => {
    await updateDoc(doc(db, "tasks", task.id), {
      completed: !task.completed,
    });
  }, []);

  // ---------- 削除（Undo対応） ----------
  const handleDelete = useCallback(async (task: Task) => {
    try {
      await deleteDoc(doc(db, "tasks", task.id));

      showUndoToast({
        message: `「${task.title}」を削除しました`,
        item: task,
        onUndo: async (restoredTask) => {
          await addDoc(collection(db, "tasks"), {
            title: restoredTask.title,
            dueDate: restoredTask.dueDate || null,
            completed: restoredTask.completed,
            createdAt: serverTimestamp(),
          });
        },
      });
    } catch (e) {
      console.error("Delete task failed", e);
    }
  }, [showUndoToast]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAdd();
  };

  // 未完了 / 完了済み 分類・ソート
  const pending = tasks.filter((t) => !t.completed).sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
  const done = tasks.filter((t) => t.completed);

  return (
    <div className="w-full max-w-xl mx-auto" style={{ padding: "2.8rem 1.5rem 6rem", boxSizing: "border-box" }}>
      
      {/* ─── ヘッダー ─── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem", padding: "0 0.25rem" }}>
        <div>
          <p style={{
            fontSize: "0.68rem",
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: C.gold,
            marginBottom: "0.4rem",
          }}>
            Arca / Tasks
          </p>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 750, color: C.charcoal, margin: 0, letterSpacing: "-0.03em" }}>
            タスク
          </h1>
          <p style={{ fontSize: "0.78rem", color: C.charcoalLight, margin: "0.3rem 0 0", letterSpacing: "0.01em" }}>
            {pending.length}件の未完了タスク
          </p>
        </div>
      </div>

      {/* ─── 入力フォーム ─── */}
      <div style={{ marginBottom: "2.2rem" }}>
        <div
          className="arca-card"
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0.65rem 1rem",
            gap: "0.75rem",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="タスクを追加…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: "0.92rem",
              color: C.charcoal,
              letterSpacing: "0.01em",
            }}
          />

          {/* 期限日選択 */}
          <input
            type="date"
            value={dueInput}
            onChange={(e) => setDueInput(e.target.value)}
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: "0.78rem",
              color: dueInput ? C.charcoalMid : C.charcoalXLight,
              cursor: "pointer",
              fontFamily: "-apple-system, sans-serif",
            }}
            title="期限日を設定"
          />

          <button
            onClick={handleAdd}
            disabled={!titleInput.trim() || isAdding}
            style={{
              background: titleInput.trim() ? C.gold : "rgba(0, 0, 0, 0.06)",
              color: titleInput.trim() ? "#FDFCFA" : C.charcoalXLight,
              border: "none",
              borderRadius: "10px",
              padding: "0.45rem 0.95rem",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: titleInput.trim() ? "pointer" : "default",
              transition: "all 0.15s ease",
              flexShrink: 0,
            }}
          >
            追加
          </button>
        </div>
      </div>

      {/* ─── タスク一覧 ─── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.8rem" }}>
        
        {/* 未完了タスク */}
        <div
          className="arca-card"
          style={{
            padding: "0.8rem 1.25rem",
          }}
        >
          {pending.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight, textAlign: "center", padding: "2rem 0" }}>
              タスクはありません
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
              {pending.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}
        </div>

        {/* 完了済みタスク */}
        {done.length > 0 && (
          <div>
            <span style={{ fontSize: "0.72rem", color: C.charcoalLight, letterSpacing: "0.06em", padding: "0 0.5rem", display: "block", marginBottom: "0.6rem" }}>
              完了済み
            </span>
            <div
              className="arca-card"
              style={{
                padding: "0.8rem 1.25rem",
                opacity: 0.85,
              }}
            >
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                {done.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            </div>
          </div>
        )}

      </div>

      {/* ─── 共通 Undo トースト ─── */}
      <UndoToast toast={toast} onUndo={triggerUndo} onDismiss={dismissToast} />
    </div>
  );
}
