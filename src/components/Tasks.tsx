/**
 * src/components/Tasks.tsx
 * Arca — Tasks / タスク管理 (Apple HIG × Arca 準拠)
 *
 * Sprint 5:
 *  - Apple HIG準拠 サブタスク機能（Subtasks）:
 *    - 各タスクごとのアコーディオン展開 / 折りたたみ
 *    - サブタスク専用チェックボックス・インライン連続追加・個別削除
 *    - 進捗インジケーターピル（例: 1/3）
 *    - Gemini「✦ ステップ分解」連携（生成結果を subtasks 配列に直接一括追加）
 *  - 自然言語タスク入力推論（Smart Quick Add）: 期日・優先度の自動抽出プレビュー（SVGアイコン）
 *  - Google Tasks（マイタスク）同期 & 期限管理（相互マッピング）
 *  - モバイル（iPhone）画面での入力バー横幅縮退・はみ出し完全防止
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import {
  getTaskLists,
  getTasks,
  addTask as gAddTask,
  updateTaskStatus,
  type GTaskList,
} from "../lib/googleTasks";
import { breakdownTask, parseTaskInput } from "../lib/aetherCore";
import type { TaskItem, SubTaskItem, SyncStatus } from "../types";
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
function CheckCircle({ completed, size = "1.25rem" }: { completed: boolean; size?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.75}
      style={{
        width: size,
        height: size,
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

function SubtaskCheck({ completed }: { completed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={2}
      style={{
        width: "0.95rem",
        height: "0.95rem",
        stroke: completed ? C.gold : C.charcoalLight,
        transition: "stroke 0.2s ease",
        flexShrink: 0,
      }}
    >
      {completed ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      ) : (
        <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
      )}
    </svg>
  );
}

function TrashIcon({ size = "0.95rem" }: { size?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.75}
      stroke="currentColor"
      style={{ width: size, height: size }}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
      />
    </svg>
  );
}

function SparklesIcon({ size = "13" }: { size?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: C.gold }}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" style={{ width: "0.75rem", height: "0.75rem", flexShrink: 0 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.253 18.75h18a2.25 2.25 0 0 0 2.25-2.25V7.5a2.25 2.25 0 0 0-2.25-2.25H3.75A2.25 2.25 0 0 0 1.5 7.5v11.25c0 1.243 1.007 2.25 2.25 2.25Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 10.5h21" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" style={{ width: "0.75rem", height: "0.75rem", flexShrink: 0 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
    </svg>
  );
}

function ChevronDown({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={2}
      stroke="currentColor"
      style={{
        width: "0.85rem",
        height: "0.85rem",
        transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        color: C.charcoalLight,
      }}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

// ---------- Google 同期バッジ ----------
function SyncBadge({
  isReady,
  isSignedIn,
  syncStatus,
  onSignIn,
  onSignOut,
}: {
  isReady: boolean;
  isSignedIn: boolean;
  syncStatus: SyncStatus;
  onSignIn: () => void;
  onSignOut: () => void;
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
        title="Googleでログインして同期を有効にする"
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
      <span style={{ fontSize: "0.72rem", color: statusColor, fontWeight: 500, letterSpacing: "0.02em" }}>
        {statusLabel}
      </span>
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

// ---------- タスク行（サブタスク機能・ステップ分解対応） ----------
function TaskRow({
  task,
  onToggle,
  onDelete,
  onToggleSubtask,
  onAddSubtask,
  onDeleteSubtask,
  onAiBreakdown,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleSubtask: (task: Task, subtaskId: string) => void;
  onAddSubtask: (task: Task, title: string) => Promise<void>;
  onDeleteSubtask: (task: Task, subtaskId: string) => void;
  onAiBreakdown: (task: Task) => Promise<void>;
}) {
  const [hovered, setHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isBreakingDown, setIsBreakingDown] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [subtaskHoveredId, setSubtaskHoveredId] = useState<string | null>(null);

  const subtasks = task.subtasks || [];
  const totalSubtasks = subtasks.length;
  const completedSubtasks = subtasks.filter((s) => s.completed).length;

  // AIステップ分解の実行
  const handleBreakdownClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBreakingDown || task.completed) return;
    setIsBreakingDown(true);
    setIsExpanded(true);
    try {
      await onAiBreakdown(task);
    } finally {
      setIsBreakingDown(false);
    }
  };

  // サブタスクインライン追加
  const handleSubtaskKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newSubtaskTitle.trim()) {
      e.preventDefault();
      const val = newSubtaskTitle.trim();
      setNewSubtaskTitle("");
      await onAddSubtask(task, val);
    }
  };

  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "0.75rem 0",
        borderBottom: "1px solid rgba(0, 0, 0, 0.035)",
        opacity: task.completed ? 0.45 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      {/* メインタスク行 */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", width: "100%" }}>
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
          onClick={() => onToggle(task)}
          style={{
            flex: 1,
            fontSize: "0.875rem",
            fontWeight: 400,
            color: task.completed ? C.charcoalLight : C.charcoal,
            textDecoration: task.completed ? "line-through" : "none",
            transition: "text-decoration 0.2s ease",
            letterSpacing: "0.01em",
            cursor: "pointer",
            lineHeight: 1.35,
          }}
        >
          {task.title}
        </span>

        {/* サブタスク進捗ピルバッジ (例: 1/3) */}
        {totalSubtasks > 0 && !task.completed && (
          <span
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              fontSize: "0.68rem",
              fontWeight: 550,
              color: completedSubtasks === totalSubtasks ? C.sage : C.charcoalLight,
              background: completedSubtasks === totalSubtasks ? "rgba(107, 142, 111, 0.12)" : "rgba(0, 0, 0, 0.04)",
              padding: "0.15rem 0.45rem",
              borderRadius: "6px",
              flexShrink: 0,
              cursor: "pointer",
              userSelect: "none",
            }}
            title={`${totalSubtasks}件中${completedSubtasks}件完了`}
          >
            {completedSubtasks}/{totalSubtasks}
          </span>
        )}

        {/* 優先度バッジ */}
        {task.priority === "high" && !task.completed && (
          <span
            style={{
              fontSize: "0.65rem",
              fontWeight: 600,
              color: C.danger,
              background: "rgba(224, 86, 74, 0.08)",
              padding: "0.1rem 0.4rem",
              borderRadius: "4px",
              flexShrink: 0,
            }}
          >
            高
          </span>
        )}

        {/* 期限バッジ */}
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

        {/* アクションボタン群 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.3rem",
            opacity: hovered || isBreakingDown || isExpanded ? 1 : 0,
            transition: "opacity 0.15s ease",
            flexShrink: 0,
          }}
        >
          {/* ✦ ステップ分解ボタン */}
          {!task.completed && (
            <button
              onClick={handleBreakdownClick}
              disabled={isBreakingDown}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.2rem",
                background: "transparent",
                border: "none",
                borderRadius: "6px",
                padding: "0.2rem 0.45rem",
                cursor: isBreakingDown ? "default" : "pointer",
                color: C.goldDark,
                fontSize: "0.68rem",
                fontWeight: 600,
                transition: "all 0.15s ease",
              }}
              title="AIでサブタスクに分解"
              data-testid="task-breakdown-btn"
            >
              {isBreakingDown ? (
                <span style={{ display: "inline-flex", gap: "2px", alignItems: "center" }}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      style={{
                        width: "3px",
                        height: "3px",
                        borderRadius: "50%",
                        backgroundColor: C.gold,
                        display: "inline-block",
                        animation: `aether-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </span>
              ) : (
                <SparklesIcon />
              )}
              <span>分解</span>
            </button>
          )}

          {/* サブタスク展開トグル Chevron */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: "none",
              border: "none",
              padding: "0.2rem",
              cursor: "pointer",
              lineHeight: 0,
              borderRadius: "4px",
            }}
            title={isExpanded ? "サブタスクを閉じる" : "サブタスクを開く"}
          >
            <ChevronDown expanded={isExpanded} />
          </button>

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
              borderRadius: "4px",
            }}
            title="削除"
            data-testid="task-delete-btn"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* ─── サブタスク アコーディオン展開エリア ─── */}
      {isExpanded && (
        <div
          style={{
            marginTop: "0.65rem",
            marginLeft: "2.1rem",
            padding: "0.65rem 0.85rem",
            background: "rgba(0, 0, 0, 0.02)",
            borderRadius: "12px",
            animation: "arca-view-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* サブタスク一覧 */}
          {subtasks.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "0.55rem" }}>
              {subtasks.map((st) => (
                <div
                  key={st.id}
                  onMouseEnter={() => setSubtaskHoveredId(st.id)}
                  onMouseLeave={() => setSubtaskHoveredId(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.55rem",
                    padding: "0.25rem 0.35rem",
                    borderRadius: "6px",
                    background: st.completed ? "transparent" : "rgba(255, 255, 255, 0.4)",
                  }}
                >
                  <button
                    onClick={() => onToggleSubtask(task, st.id)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", lineHeight: 0 }}
                  >
                    <SubtaskCheck completed={st.completed} />
                  </button>
                  <span
                    onClick={() => onToggleSubtask(task, st.id)}
                    style={{
                      flex: 1,
                      fontSize: "0.8rem",
                      color: st.completed ? C.charcoalLight : C.charcoal,
                      textDecoration: st.completed ? "line-through" : "none",
                      cursor: "pointer",
                    }}
                  >
                    {st.title}
                  </span>
                  {subtaskHoveredId === st.id && (
                    <button
                      onClick={() => onDeleteSubtask(task, st.id)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: "0.15rem",
                        cursor: "pointer",
                        color: C.charcoalLight,
                        lineHeight: 0,
                      }}
                      title="サブタスクを削除"
                    >
                      <TrashIcon size="0.75rem" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* サブタスク インライン追加入力欄 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginTop: "0.25rem" }}>
            <span style={{ fontSize: "0.85rem", color: C.charcoalLight, lineHeight: 1 }}>+</span>
            <input
              type="text"
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={handleSubtaskKeyDown}
              placeholder="サブタスクを追加…（Enterで追加）"
              style={{
                flex: 1,
                minWidth: 0,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: "0.78rem",
                color: C.charcoal,
                padding: "0.15rem 0",
              }}
            />
          </div>
        </div>
      )}
    </li>
  );
}

// ---------- メインコンポーネント ----------
export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [titleInput, setTitleInput] = useState("");
  const [dueInput, setDueInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  // 自然言語推論ステート
  const [parsedInfo, setParsedInfo] = useState<{
    cleanTitle?: string;
    dueDate?: string;
    priority?: "low" | "medium" | "high";
  } | null>(null);
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const gTaskListIdRef = useRef<string | null>(null);

  const { isReady, isSignedIn, accessToken, signIn, signOut } = useGoogleAuth();
  const { toast, showUndoToast, showMessageToast, dismissToast, triggerUndo } = useUndoToast<Task>();

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

  // ---------- Google Tasks（マイタスク）初期同期 ----------
  useEffect(() => {
    if (!isSignedIn || !accessToken) return;
    let isCancelled = false;

    async function initGoogleTasks() {
      try {
        setSyncStatus("syncing");
        const lists = await getTaskLists(accessToken!);
        if (!lists || lists.length === 0) {
          setSyncStatus("error");
          return;
        }

        const target = lists.find((l: GTaskList) => l.title === "My Tasks" || l.title === "マイタスク") || lists[0];
        gTaskListIdRef.current = target.id;

        const gTasks = await getTasks(accessToken!, target.id);
        if (isCancelled) return;

        // 冪等性確保: 最新のFirestoreデータを直接取得して照合
        const currentSnap = await getDocs(collection(db, "tasks"));
        const existingDocs = currentSnap.docs.map((d) => ({
          id: d.id,
          data: d.data() as Omit<Task, "id">,
        }));

        for (const gTask of gTasks) {
          if (isCancelled) return;

          const parsedDue = gTask.due ? gTask.due.split("T")[0] : null;

          // 1) googleTaskId が一致するか確認
          const matchById = existingDocs.find(
            (item) => item.data.googleTaskId === gTask.id
          );

          if (matchById) {
            const isCompleted = gTask.status === "completed";
            const dueDiffers = (matchById.data.dueDate || null) !== parsedDue;
            if (matchById.data.completed !== isCompleted || dueDiffers) {
              await updateDoc(doc(db, "tasks", matchById.id), {
                completed: isCompleted,
                dueDate: parsedDue,
              });
            }
            continue;
          }

          // 2) 同一タイトルの未紐付けタスクが存在するか確認
          const matchByTitle = existingDocs.find(
            (item) =>
              !item.data.googleTaskId &&
              item.data.title.trim() === gTask.title.trim()
          );

          if (matchByTitle) {
            await updateDoc(doc(db, "tasks", matchByTitle.id), {
              googleTaskId: gTask.id,
              completed: gTask.status === "completed",
              dueDate: parsedDue || matchByTitle.data.dueDate || null,
            });
            continue;
          }

          // 3) どちらにも該当しない場合は新規追加
          await addDoc(collection(db, "tasks"), {
            title: gTask.title,
            dueDate: parsedDue,
            completed: gTask.status === "completed",
            googleTaskId: gTask.id,
            createdAt: serverTimestamp(),
          });
        }

        setSyncStatus("done");
        setTimeout(() => {
          if (!isCancelled) setSyncStatus("idle");
        }, 3000);
      } catch (err) {
        console.error("Google Tasks sync error:", err);
        if (!isCancelled) setSyncStatus("error");
      }
    }

    initGoogleTasks();
    return () => {
      isCancelled = true;
    };
  }, [isSignedIn, accessToken]);

  // ---------- タスク入力の自然言語推論 ----------
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitleInput(val);

    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    if (!val.trim() || val.trim().length < 2) {
      setParsedInfo(null);
      return;
    }

    parseTimerRef.current = setTimeout(async () => {
      const res = await parseTaskInput(val);
      if (res && (res.dueDate || res.priority === "high" || res.priority === "low")) {
        setParsedInfo({
          cleanTitle: res.title,
          dueDate: res.dueDate,
          priority: res.priority,
        });
      } else {
        setParsedInfo(null);
      }
    }, 550);
  };

  // ---------- タスク追加 ----------
  const handleAdd = useCallback(async () => {
    const trimmed = titleInput.trim();
    if (!trimmed || isAdding) return;

    setIsAdding(true);
    const finalTitle = parsedInfo?.cleanTitle || trimmed;
    const finalDue = dueInput || parsedInfo?.dueDate || null;
    const finalPriority = parsedInfo?.priority || "medium";

    try {
      let googleTaskId: string | undefined;
      if (isSignedIn && accessToken && gTaskListIdRef.current) {
        try {
          googleTaskId = await gAddTask(
            accessToken,
            gTaskListIdRef.current,
            finalTitle,
            finalDue || undefined
          );
        } catch (gErr) {
          console.error("Failed to add task to Google Tasks:", gErr);
        }
      }

      await addDoc(collection(db, "tasks"), {
        title: finalTitle,
        dueDate: finalDue,
        priority: finalPriority,
        completed: false,
        subtasks: [],
        googleTaskId: googleTaskId || null,
        createdAt: serverTimestamp(),
      });
      setTitleInput("");
      setDueInput("");
      setParsedInfo(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      setIsAdding(false);
    }
  }, [titleInput, dueInput, parsedInfo, isAdding, isSignedIn, accessToken]);

  // ---------- サブタスク完了トグル ----------
  const handleToggleSubtask = useCallback(async (task: Task, subtaskId: string) => {
    const nextSubtasks = (task.subtasks || []).map((st) =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );
    await updateDoc(doc(db, "tasks", task.id), {
      subtasks: nextSubtasks,
    });
  }, []);

  // ---------- サブタスクインライン追加 ----------
  const handleAddSubtask = useCallback(async (task: Task, title: string) => {
    const newSub: SubTaskItem = {
      id: "sub-" + Math.random().toString(36).slice(2, 9),
      title,
      completed: false,
    };
    const nextSubtasks = [...(task.subtasks || []), newSub];
    await updateDoc(doc(db, "tasks", task.id), {
      subtasks: nextSubtasks,
    });
  }, []);

  // ---------- サブタスク削除 ----------
  const handleDeleteSubtask = useCallback(async (task: Task, subtaskId: string) => {
    const nextSubtasks = (task.subtasks || []).filter((st) => st.id !== subtaskId);
    await updateDoc(doc(db, "tasks", task.id), {
      subtasks: nextSubtasks,
    });
  }, []);

  // ---------- Gemini「✦ ステップ分解」連携 ----------
  const handleAiBreakdown = useCallback(async (task: Task) => {
    try {
      const generated = await breakdownTask(task.title);
      if (generated && generated.length > 0) {
        const newSubs: SubTaskItem[] = generated.map((title) => ({
          id: "sub-" + Math.random().toString(36).slice(2, 9),
          title,
          completed: false,
        }));
        const nextSubtasks = [...(task.subtasks || []), ...newSubs];
        await updateDoc(doc(db, "tasks", task.id), {
          subtasks: nextSubtasks,
        });
        showMessageToast(`${generated.length}件のサブタスクを展開しました`);
      } else {
        showMessageToast("サブタスクを生成できませんでした");
      }
    } catch (e) {
      console.error("AI breakdown failed", e);
      showMessageToast("ステップ分解中にエラーが発生しました");
    }
  }, [showMessageToast]);

  // ---------- 完了トグル ----------
  const handleToggle = useCallback(
    async (task: Task) => {
      const next = !task.completed;
      await updateDoc(doc(db, "tasks", task.id), {
        completed: next,
      });

      if (isSignedIn && accessToken && gTaskListIdRef.current && task.googleTaskId) {
        try {
          await updateTaskStatus(
            accessToken,
            gTaskListIdRef.current,
            task.googleTaskId,
            next
          );
        } catch (gErr) {
          console.error("Failed to update Google Task status:", gErr);
        }
      }
    },
    [isSignedIn, accessToken]
  );

  // ---------- 削除（Undo対応） ----------
  const handleDelete = useCallback(
    async (task: Task) => {
      try {
        await deleteDoc(doc(db, "tasks", task.id));

        showUndoToast({
          message: `「${task.title}」を削除しました`,
          item: task,
          onUndo: async (restoredTask) => {
            await addDoc(collection(db, "tasks"), {
              title: restoredTask.title,
              dueDate: restoredTask.dueDate || null,
              priority: restoredTask.priority || "medium",
              completed: restoredTask.completed,
              subtasks: restoredTask.subtasks || [],
              googleTaskId: restoredTask.googleTaskId || null,
              createdAt: serverTimestamp(),
            });
          },
        });
      } catch (e) {
        console.error("Delete task failed", e);
      }
    },
    [showUndoToast]
  );

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
      
      {/* ─── ヘッダー（統一された静かなデザイン） ─── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem", padding: "0 0.25rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 750, color: C.charcoal, margin: 0, letterSpacing: "-0.03em" }}>
            タスク
          </h1>
          <p style={{ fontSize: "0.78rem", color: C.charcoalLight, margin: "0.3rem 0 0", letterSpacing: "0.01em" }}>
            {pending.length}件の未完了タスク
          </p>
        </div>

        <SyncBadge
          isReady={isReady}
          isSignedIn={isSignedIn}
          syncStatus={syncStatus}
          onSignIn={signIn}
          onSignOut={signOut}
        />
      </div>

      {/* ─── 入力フォーム（自然言語推論プレビュー付き） ─── */}
      <div style={{ marginBottom: "2.2rem" }}>
        <div
          className="arca-card"
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0.55rem 0.85rem",
            gap: "0.45rem",
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          {/* テキスト入力欄: minWidth: 0 で縮退可能にし、はみ出しを防止 */}
          <input
            ref={inputRef}
            type="text"
            value={titleInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="タスクを追加…（例: 明日15時に書類提出）"
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: "0.92rem",
              color: C.charcoal,
              letterSpacing: "0.01em",
            }}
          />

          {/* AI推論プレビューバッジ（期日・優先度） */}
          {parsedInfo && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexShrink: 0 }}>
              {parsedInfo.dueDate && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    fontSize: "0.68rem",
                    fontWeight: 600,
                    color: C.goldDark,
                    background: "rgba(184, 150, 106, 0.12)",
                    padding: "0.2rem 0.5rem",
                    borderRadius: "9999px",
                    whiteSpace: "nowrap",
                  }}
                  title={`推論された期日: ${parsedInfo.dueDate}`}
                >
                  <CalendarIcon />
                  <span>{formatDue(parsedInfo.dueDate)}</span>
                </span>
              )}
              {parsedInfo.priority === "high" && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.2rem",
                    fontSize: "0.68rem",
                    fontWeight: 600,
                    color: C.danger,
                    background: "rgba(224, 86, 74, 0.12)",
                    padding: "0.2rem 0.5rem",
                    borderRadius: "9999px",
                    whiteSpace: "nowrap",
                  }}
                  title="優先度: 高"
                >
                  <ZapIcon />
                  <span>高</span>
                </span>
              )}
            </div>
          )}

          {/* 期限日手動選択 */}
          <input
            type="date"
            value={dueInput}
            onChange={(e) => setDueInput(e.target.value)}
            style={{
              flexShrink: 0,
              width: "auto",
              maxWidth: "115px",
              background: "rgba(0, 0, 0, 0.03)",
              borderRadius: "8px",
              padding: "0.3rem 0.4rem",
              border: "none",
              outline: "none",
              fontSize: "0.72rem",
              color: dueInput ? C.charcoalMid : C.charcoalXLight,
              cursor: "pointer",
              fontFamily: "-apple-system, sans-serif",
            }}
            title="期限日を設定"
          />

          {/* 追加ボタン */}
          <button
            onClick={handleAdd}
            disabled={!titleInput.trim() || isAdding}
            style={{
              flexShrink: 0,
              background: titleInput.trim() ? C.gold : "rgba(0, 0, 0, 0.06)",
              color: titleInput.trim() ? "#FDFCFA" : C.charcoalXLight,
              border: "none",
              borderRadius: "10px",
              padding: "0.45rem 0.85rem",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: titleInput.trim() ? "pointer" : "default",
              transition: "all 0.15s ease",
              minWidth: "44px",
              minHeight: "34px",
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
                  onToggleSubtask={handleToggleSubtask}
                  onAddSubtask={handleAddSubtask}
                  onDeleteSubtask={handleDeleteSubtask}
                  onAiBreakdown={handleAiBreakdown}
                />
              ))}
            </ul>
          )}
        </div>

        {/* 完了済みタスク */}
        {done.length > 0 && (
          <div>
            <span style={{ fontSize: "0.72rem", color: C.charcoalLight, letterSpacing: "0.06em", padding: "0 0.5rem", display: "block", marginBottom: "0.6rem" }}>
              完了済み ({done.length})
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
                    onToggleSubtask={handleToggleSubtask}
                    onAddSubtask={handleAddSubtask}
                    onDeleteSubtask={handleDeleteSubtask}
                    onAiBreakdown={handleAiBreakdown}
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
