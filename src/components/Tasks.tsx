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

// ---------- 型エイリアス (後方互換) ----------
// TaskItem を Tasks モジュール内では Task と呼ぶ
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
  if (diff < 0)  return "#E07070";             // 期限超過
  if (diff === 0) return "var(--color-accent)"; // 今日
  if (diff <= 2)  return "#C5A059CC";           // 近日
  return "#B0AFA8";                             // 余裕あり
}

// ---------- アイコン ----------
function CheckCircle({ completed }: { completed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.5}
      className="flex-shrink-0 transition-all duration-300"
      style={{
        width: "1.2rem",
        height: "1.2rem",
        stroke: completed ? "var(--color-accent)" : "#C8C8C0",
      }}
    >
      {completed ? (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
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
      strokeWidth={1.5}
      stroke="currentColor"
      style={{ width: "0.9rem", height: "0.9rem" }}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
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
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0.85rem 0",
        borderBottom: "1px solid rgba(0,0,0,0.045)",
        opacity: task.completed ? 0.38 : 1,
        transition: "opacity 0.25s",
        cursor: "default",
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
          fontWeight: 300,
          color: "var(--color-text)",
          textDecoration: task.completed ? "line-through" : "none",
          transition: "text-decoration 0.2s",
          letterSpacing: "0.01em",
        }}
      >
        {task.title}
      </span>

      {/* 期限バッジ */}
      {task.dueDate && !task.completed && (
        <span
          style={{
            fontSize: "0.65rem",
            letterSpacing: "0.06em",
            color: dueColor(task.dueDate),
            flexShrink: 0,
          }}
        >
          {formatDue(task.dueDate)}
        </span>
      )}

      {/* 削除ボタン（ホバー時のみ表示） */}
      <button
        onClick={() => onDelete(task.id)}
        style={{
          background: "none",
          border: "none",
          padding: "0.2rem",
          cursor: "pointer",
          color: "#C8C8C0",
          lineHeight: 0,
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.2s",
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
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [titleInput, setTitleInput] = useState("");
  const [dueInput, setDueInput]   = useState("");
  const [isAdding, setIsAdding]   = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

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
    if (!trimmed) return;

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
  }, [titleInput, dueInput]);

  // ---------- 完了トグル ----------
  const handleToggle = useCallback(async (task: Task) => {
    await updateDoc(doc(db, "tasks", task.id), {
      completed: !task.completed,
    });
  }, []);

  // ---------- 削除 ----------
  const handleDelete = useCallback(async (id: string) => {
    await deleteDoc(doc(db, "tasks", id));
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAdd();
  };

  // 未完了 / 完了済み 分類・ソート
  const pending = tasks.filter((t) => !t.completed).sort((a, b) => {
    // 期限あり → 期限日順、期限なし → 後ろ
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
  const done = tasks.filter((t) => t.completed);

  // ---------- レンダリング ----------
  return (
    <div
      className="w-full max-w-xl mx-auto"
      style={{ padding: "3rem 1.5rem" }}
    >
      {/* ヘッダー */}
      <div style={{ marginBottom: "2.5rem" }}>
        <p
          style={{
            fontSize: "0.7rem",
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--color-accent)",
            marginBottom: "0.5rem",
          }}
        >
          Arca / Tasks
        </p>
        <h2
          style={{
            fontSize: "1.5rem",
            fontWeight: 300,
            letterSpacing: "0.03em",
            color: "var(--color-text)",
            margin: 0,
          }}
        >
          タスク
        </h2>
      </div>

      {/* 入力カード */}
      <div
        style={{
          background: "rgba(255,255,255,0.72)",
          borderRadius: "14px",
          padding: "0.85rem 1rem",
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
          backdropFilter: "blur(8px)",
          marginBottom: "2.5rem",
        }}
      >
        {/* タイトル行 */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <input
            ref={inputRef}
            type="text"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="タスクを追加…"
            autoFocus
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: "0.875rem",
              color: "var(--color-text)",
              letterSpacing: "0.01em",
            }}
          />
          <button
            onClick={handleAdd}
            disabled={isAdding || !titleInput.trim()}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: "0.7rem",
              fontWeight: 500,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--color-accent)",
              opacity: isAdding || !titleInput.trim() ? 0.3 : 1,
              transition: "opacity 0.2s",
            }}
          >
            {isAdding ? "…" : "追加"}
          </button>
        </div>

        {/* 期限入力 — セパレータ付きでさりげなく */}
        <div
          style={{
            marginTop: "0.55rem",
            paddingTop: "0.55rem",
            borderTop: "1px solid rgba(0,0,0,0.04)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span
            style={{
              fontSize: "0.65rem",
              letterSpacing: "0.08em",
              color: "#C0BEB8",
            }}
          >
            期限
          </span>
          <input
            type="date"
            value={dueInput}
            onChange={(e) => setDueInput(e.target.value)}
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: "0.72rem",
              color: dueInput ? "var(--color-text)" : "#C0BEB8",
              letterSpacing: "0.04em",
              cursor: "pointer",
            }}
          />
        </div>
      </div>

      {/* 空状態 */}
      {pending.length === 0 && done.length === 0 && (
        <p
          style={{
            fontSize: "0.875rem",
            textAlign: "center",
            color: "#B0AFA8",
            padding: "3rem 0",
          }}
        >
          タスクはありません
        </p>
      )}

      {/* 未完了リスト */}
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {pending.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onToggle={handleToggle}
            onDelete={handleDelete}
          />
        ))}
      </ul>

      {/* 完了済み */}
      {done.length > 0 && (
        <div style={{ marginTop: "2.5rem" }}>
          <p
            style={{
              fontSize: "0.65rem",
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#C0BEB8",
              marginBottom: "1rem",
            }}
          >
            完了済み
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
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
      )}
    </div>
  );
}
