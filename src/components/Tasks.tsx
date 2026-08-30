/**
 * src/components/Tasks.tsx
 * Arca — Tasks / タスク管理 (Apple HIG × Google Todo 双方向同期)
 *
 * 設計原則:
 * - 一体化タブ型リスト管理（Sliding Pill スライディングアニメーション・均一幅・文字数制限）
 * - クリック領域の厳密な分離（チェックボックス: 完了トグル / カード・テキスト: 詳細編集モーダル起動）
 * - モバイル対応（一覧からの直接削除ボタン、優先度・期限バッジの常時クリーン表示）
 * - Google Tasks 完全双方向同期 & 冪等性確保
 * - AetherCore ステップ分解 & サブタスク管理統合
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
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import {
  getTaskLists,
  type GTaskList,
} from "../lib/googleTasks";
import {
  syncGoogleTasksForList,
  pushTaskToGoogleTasks,
  pushTaskStatusToGoogleTasks,
  pushTaskUpdateToGoogleTasks,
  removeTaskFromGoogleTasks,
  createGoogleTaskList,
  renameGoogleTaskList,
  deleteGoogleTaskList,
} from "../services/googleTasksSync";
import { parseTaskInput } from "../lib/aetherCore";
import type { TaskItem, TaskListCategory, SyncStatus } from "../types";
import { C } from "../lib/designSystem";
import { useUndoToast } from "../hooks/useUndoToast";
import { UndoToast } from "./common/UndoToast";
import { PMSection } from "./tasks/PMSection";
import { TaskDetailModal } from "./tasks/TaskDetailModal";

export interface TasksProps {
  initialTab?: string;
}

type Task = TaskItem;

// ── 初期デフォルトカテゴリ ──
const DEFAULT_CATEGORIES: TaskListCategory[] = [
  { id: "default", title: "マイタスク", isDefault: true },
  { id: "shopping", title: "買い物リスト" },
];

const MAX_LIST_NAME_LENGTH = 15;

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
function CheckCircle({ completed, size = "1.3rem" }: { completed: boolean; size?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.8}
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

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
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

// ---------- タスク行（クリック領域完全分離・直接削除ボタン付き） ----------
function TaskRow({
  task,
  onToggle,
  onClickRow,
  onDelete,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onClickRow: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const subtasks = task.subtasks || [];
  const totalSubtasks = subtasks.length;
  const completedSubtasks = subtasks.filter((s) => s.completed).length;

  return (
    <li
      onClick={() => onClickRow(task)}
      data-testid="task-item-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.85rem",
        padding: "0.85rem 0.6rem",
        borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
        opacity: task.completed ? 0.45 : 1,
        transition: "opacity 0.2s ease, background 0.15s ease",
        cursor: "pointer",
        borderRadius: "10px",
      }}
    >
      {/* ─── 左端: 丸いチェックボタン（e.stopPropagation で完了トグルのみ） ─── */}
      <button
        type="button"
        data-testid="task-toggle-btn"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(task);
        }}
        style={{
          background: "none",
          border: "none",
          padding: "0.25rem",
          margin: "-0.25rem",
          cursor: "pointer",
          lineHeight: 0,
          minWidth: "32px",
          minHeight: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        title={task.completed ? "未完了に戻す" : "完了にする"}
      >
        <CheckCircle completed={task.completed} />
      </button>

      {/* ─── タスクタイトル ─── */}
      <span
        style={{
          flex: 1,
          fontSize: "0.9rem",
          fontWeight: 450,
          color: task.completed ? C.charcoalLight : C.charcoal,
          textDecoration: task.completed ? "line-through" : "none",
          transition: "text-decoration 0.2s ease",
          letterSpacing: "0.01em",
          lineHeight: 1.4,
          wordBreak: "break-word",
        }}
      >
        {task.title}
      </span>

      {/* ─── 右端情報（サブタスク進捗ピル・優先度・期限・ゴミ箱） ─── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
        {/* サブタスク進捗ピルバッジ */}
        {totalSubtasks > 0 && !task.completed && (
          <span
            style={{
              fontSize: "0.68rem",
              fontWeight: 600,
              color: completedSubtasks === totalSubtasks ? C.sage : C.charcoalLight,
              background: completedSubtasks === totalSubtasks ? "rgba(107, 142, 111, 0.12)" : "rgba(0, 0, 0, 0.04)",
              padding: "0.15rem 0.45rem",
              borderRadius: "6px",
              whiteSpace: "nowrap",
            }}
            title={`${totalSubtasks}件中${completedSubtasks}件完了`}
          >
            {completedSubtasks}/{totalSubtasks}
          </span>
        )}

        {/* 優先度バッジ（高・低） */}
        {task.priority === "high" && !task.completed && (
          <span
            data-testid="priority-high-badge"
            style={{
              fontSize: "0.65rem",
              fontWeight: 600,
              color: C.danger,
              background: "rgba(224, 86, 74, 0.08)",
              padding: "0.12rem 0.4rem",
              borderRadius: "5px",
              whiteSpace: "nowrap",
            }}
          >
            高
          </span>
        )}
        {task.priority === "low" && !task.completed && (
          <span
            data-testid="priority-low-badge"
            style={{
              fontSize: "0.65rem",
              fontWeight: 600,
              color: "#4A709C",
              background: "rgba(74, 112, 156, 0.08)",
              padding: "0.12rem 0.4rem",
              borderRadius: "5px",
              whiteSpace: "nowrap",
            }}
          >
            低
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
              padding: "0.15rem 0.45rem",
              borderRadius: "6px",
              background: "rgba(0, 0, 0, 0.03)",
              whiteSpace: "nowrap",
            }}
          >
            {formatDue(task.dueDate)}
          </span>
        )}

        {/* 一覧からの直接削除ボタン */}
        <button
          type="button"
          data-testid="task-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task);
          }}
          style={{
            background: "none",
            border: "none",
            padding: "0.3rem",
            margin: "-0.2rem",
            cursor: "pointer",
            color: C.charcoalLight,
            opacity: 0.6,
            lineHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "opacity 0.15s ease, color 0.15s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "1";
            (e.currentTarget as HTMLElement).style.color = C.danger;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "0.6";
            (e.currentTarget as HTMLElement).style.color = C.charcoalLight;
          }}
          title="タスクを削除"
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}

// ---------- メインコンポーネント ----------
export default function Tasks({ initialTab = "default" }: TasksProps = {}) {
  const [categories, setCategories] = useState<TaskListCategory[]>(DEFAULT_CATEGORIES);
  const [activeListId, setActiveListId] = useState<string>(
    initialTab === "shopping" ? "shopping" : "default"
  );
  const [tasks, setTasks] = useState<Task[]>([]);
  const [titleInput, setTitleInput] = useState("");
  const [dueInput, setDueInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  // 詳細編集モーダル用 State
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  // リスト作成・編集モーダル用 State
  const [showAddListModal, setShowAddListModal] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [editingCategory, setEditingCategory] = useState<TaskListCategory | null>(null);
  const [showDeleteListConfirm, setShowDeleteListConfirm] = useState(false);

  // 自然言語推論ステート
  const [parsedInfo, setParsedInfo] = useState<{
    cleanTitle?: string;
    dueDate?: string;
    priority?: "low" | "medium" | "high";
  } | null>(null);
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sliding Pill アニメーション用の Ref & State
  const tabTrackRef = useRef<HTMLDivElement>(null);
  const tabItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [pillStyle, setPillStyle] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    ready: boolean;
  }>({
    left: 0,
    top: 3,
    width: 0,
    height: 0,
    ready: false,
  });

  const { isReady, isSignedIn, accessToken, signIn, signOut } = useGoogleAuth();
  const { toast, showUndoToast, dismissToast, triggerUndo } = useUndoToast<Task>();

  // Sliding Pill の位置・幅更新
  const updatePill = useCallback(() => {
    const activeEl = tabItemRefs.current.get(activeListId);
    const track = tabTrackRef.current;
    if (!activeEl || !track) return;

    const elLeft = activeEl.offsetLeft;
    const elTop = activeEl.offsetTop;
    const elWidth = activeEl.offsetWidth;
    const elHeight = activeEl.offsetHeight;

    setPillStyle({
      left: elLeft,
      top: elTop,
      width: elWidth,
      height: elHeight,
      ready: true,
    });
  }, [activeListId]);

  useEffect(() => {
    updatePill();
    const raf = requestAnimationFrame(updatePill);
    const timer = setTimeout(updatePill, 60);

    const handleResize = () => updatePill();
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [updatePill, categories]);

  // ---------- Firestore リアルタイム購読（タスク） ----------
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

  // ---------- Google Tasks リスト & タスク初期同期 ----------
  useEffect(() => {
    if (!isSignedIn || !accessToken) return;
    let isCancelled = false;

    async function initGoogleSync() {
      try {
        setSyncStatus("syncing");
        const gLists: GTaskList[] = await getTaskLists(accessToken!);
        if (isCancelled || !gLists || gLists.length === 0) {
          setSyncStatus("idle");
          return;
        }

        // Google Tasks のリストをカテゴリにマッピング
        const mappedCategories: TaskListCategory[] = [];
        for (const gl of gLists) {
          const isMyTasks = gl.title === "My Tasks" || gl.title === "マイタスク" || gl.id === "@default";
          const isShop = gl.title === "買い物リスト" || gl.title === "買い物" || gl.title === "Shopping List";

          if (isMyTasks) {
            mappedCategories.push({
              id: "default",
              title: "マイタスク",
              googleListId: gl.id,
              isDefault: true,
            });
          } else if (isShop) {
            mappedCategories.push({
              id: "shopping",
              title: gl.title,
              googleListId: gl.id,
            });
          } else {
            mappedCategories.push({
              id: gl.id,
              title: gl.title,
              googleListId: gl.id,
            });
          }
        }

        // 重複排除
        const uniqueCategories: TaskListCategory[] = [];
        for (const cat of mappedCategories) {
          if (!uniqueCategories.some((u) => u.id === cat.id)) {
            uniqueCategories.push(cat);
          }
        }
        if (!uniqueCategories.some((u) => u.id === "default")) {
          uniqueCategories.unshift(DEFAULT_CATEGORIES[0]);
        }
        if (!uniqueCategories.some((u) => u.id === "shopping")) {
          uniqueCategories.push(DEFAULT_CATEGORIES[1]);
        }

        setCategories(uniqueCategories);

        // 各カテゴリのタスクを同期
        for (const cat of uniqueCategories) {
          if (cat.googleListId) {
            await syncGoogleTasksForList(accessToken!, cat.googleListId, cat.id);
          }
        }

        setSyncStatus("done");
        setTimeout(() => {
          if (!isCancelled) setSyncStatus("idle");
        }, 3000);
      } catch (err) {
        console.error("Google Tasks sync failed:", err);
        if (!isCancelled) setSyncStatus("error");
      }
    }

    initGoogleSync();
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
      const currentCategory = categories.find((c) => c.id === activeListId);
      let googleTaskId: string | undefined;

      if (isSignedIn && accessToken && currentCategory?.googleListId) {
        try {
          googleTaskId = await pushTaskToGoogleTasks(
            accessToken,
            currentCategory.googleListId,
            finalTitle,
            finalDue
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
        listId: activeListId,
        googleTaskId: googleTaskId || null,
        googleListId: currentCategory?.googleListId || null,
        subtasks: [],
        createdAt: serverTimestamp(),
      });

      setTitleInput("");
      setDueInput("");
      setParsedInfo(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      setIsAdding(false);
    }
  }, [titleInput, dueInput, parsedInfo, isAdding, activeListId, categories, isSignedIn, accessToken]);

  // ---------- 完了トグル ----------
  const handleToggle = useCallback(
    async (task: Task) => {
      const next = !task.completed;
      await updateDoc(doc(db, "tasks", task.id), {
        completed: next,
      });

      if (isSignedIn && accessToken && task.googleTaskId) {
        const cat = categories.find((c) => c.id === (task.listId || "default"));
        const targetGoogleListId = task.googleListId || cat?.googleListId;
        if (targetGoogleListId) {
          try {
            await pushTaskStatusToGoogleTasks(
              accessToken,
              targetGoogleListId,
              task.googleTaskId,
              next
            );
          } catch (gErr) {
            console.error("Failed to update Google Task status:", gErr);
          }
        }
      }
    },
    [isSignedIn, accessToken, categories]
  );

  // ---------- タスク詳細保存 ----------
  const handleSaveDetail = useCallback(
    async (updatedTask: Task) => {
      await updateDoc(doc(db, "tasks", updatedTask.id), {
        title: updatedTask.title,
        dueDate: updatedTask.dueDate || null,
        priority: updatedTask.priority || "medium",
        listId: updatedTask.listId || "default",
        subtasks: updatedTask.subtasks || [],
        updatedAt: serverTimestamp(),
      });

      if (isSignedIn && accessToken && updatedTask.googleTaskId) {
        const cat = categories.find((c) => c.id === (updatedTask.listId || "default"));
        const targetGoogleListId = updatedTask.googleListId || cat?.googleListId;
        if (targetGoogleListId) {
          try {
            await pushTaskUpdateToGoogleTasks(
              accessToken,
              targetGoogleListId,
              updatedTask.googleTaskId,
              {
                title: updatedTask.title,
                dueDate: updatedTask.dueDate || null,
              }
            );
          } catch (gErr) {
            console.error("Failed to update Google Task:", gErr);
          }
        }
      }
    },
    [isSignedIn, accessToken, categories]
  );

  // ---------- タスク削除（Undo対応） ----------
  const handleDeleteTask = useCallback(
    async (task: Task) => {
      try {
        await deleteDoc(doc(db, "tasks", task.id));

        if (isSignedIn && accessToken && task.googleTaskId) {
          const cat = categories.find((c) => c.id === (task.listId || "default"));
          const targetGoogleListId = task.googleListId || cat?.googleListId;
          if (targetGoogleListId) {
            try {
              await removeTaskFromGoogleTasks(accessToken, targetGoogleListId, task.googleTaskId);
            } catch (gErr) {
              console.error("Failed to delete Google Task:", gErr);
            }
          }
        }

        showUndoToast({
          message: `「${task.title}」を削除しました`,
          item: task,
          onUndo: async (restoredTask) => {
            await addDoc(collection(db, "tasks"), {
              title: restoredTask.title,
              dueDate: restoredTask.dueDate || null,
              priority: restoredTask.priority || "medium",
              completed: restoredTask.completed,
              listId: restoredTask.listId || "default",
              subtasks: restoredTask.subtasks || [],
              googleTaskId: restoredTask.googleTaskId || null,
              googleListId: restoredTask.googleListId || null,
              createdAt: serverTimestamp(),
            });
          },
        });
      } catch (e) {
        console.error("Delete task failed", e);
      }
    },
    [showUndoToast, isSignedIn, accessToken, categories]
  );

  // ---------- 新規リスト作成 ----------
  const handleCreateList = async () => {
    const title = newListName.trim().slice(0, MAX_LIST_NAME_LENGTH);
    if (!title) return;

    let googleListId: string | undefined;
    if (isSignedIn && accessToken) {
      try {
        const createdGList = await createGoogleTaskList(accessToken, title);
        googleListId = createdGList.id;
      } catch (err) {
        console.error("Failed to create Google TaskList:", err);
      }
    }

    const newId = "list-" + Math.random().toString(36).slice(2, 9);
    const newCat: TaskListCategory = {
      id: newId,
      title,
      googleListId,
    };

    setCategories((prev) => [...prev, newCat]);
    setActiveListId(newId);
    setNewListName("");
    setShowAddListModal(false);
  };

  // ---------- リスト名変更 ----------
  const handleRenameList = async () => {
    if (!editingCategory) return;
    const title = editingCategory.title.trim().slice(0, MAX_LIST_NAME_LENGTH);
    if (!title) return;

    if (isSignedIn && accessToken && editingCategory.googleListId) {
      try {
        await renameGoogleTaskList(accessToken, editingCategory.googleListId, title);
      } catch (err) {
        console.error("Failed to rename Google TaskList:", err);
      }
    }

    setCategories((prev) =>
      prev.map((c) => (c.id === editingCategory.id ? { ...editingCategory, title } : c))
    );
    setEditingCategory(null);
  };

  // ---------- リスト削除（所属タスクも全削除） ----------
  const handleDeleteList = async () => {
    if (!editingCategory || editingCategory.isDefault) return;

    const listIdToDelete = editingCategory.id;

    // 1. 所属するタスクをFirestoreからすべて削除
    const tasksToDelete = tasks.filter((t) => (t.listId || "default") === listIdToDelete);
    for (const t of tasksToDelete) {
      await deleteDoc(doc(db, "tasks", t.id));
    }

    // 2. Google Tasks 側でもリスト削除
    if (isSignedIn && accessToken && editingCategory.googleListId) {
      try {
        await deleteGoogleTaskList(accessToken, editingCategory.googleListId);
      } catch (err) {
        console.error("Failed to delete Google TaskList:", err);
      }
    }

    // 3. カテゴリState更新
    setCategories((prev) => prev.filter((c) => c.id !== listIdToDelete));
    if (activeListId === listIdToDelete) {
      setActiveListId("default");
    }

    setShowDeleteListConfirm(false);
    setEditingCategory(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAdd();
  };

  // 選択中リストのタスクを抽出・分類
  const currentTasks = tasks.filter(
    (t) => (t.listId || "default") === activeListId
  );

  const pending = currentTasks.filter((t) => !t.completed).sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
  const done = currentTasks.filter((t) => t.completed);

  return (
    <div className="w-full max-w-3xl mx-auto" style={{ padding: "2.4rem 1.2rem 6rem", boxSizing: "border-box" }}>
      
      {/* ─── ヘッダー ─── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.2rem", padding: "0 0.25rem" }}>
        <div>
          <p style={{ fontSize: "0.68rem", fontWeight: 650, color: C.charcoalLight, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>
            TASKS & LISTS
          </p>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 750, color: C.charcoal, margin: "0.15rem 0 0", letterSpacing: "-0.03em" }}>
            {categories.find((c) => c.id === activeListId)?.title || "タスク"}
          </h1>
        </div>

        <SyncBadge
          isReady={isReady}
          isSignedIn={isSignedIn}
          syncStatus={syncStatus}
          onSignIn={signIn}
          onSignOut={signOut}
        />
      </div>

      {/* ─── 一体化タブ型セグメントコントロール（Sliding Pill アニメーション付き） ─── */}
      <div
        ref={tabTrackRef}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          background: "rgba(0, 0, 0, 0.05)",
          borderRadius: "9999px",
          padding: "3px",
          marginBottom: "1.6rem",
          overflowX: "auto",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          gap: "2px",
          boxSizing: "border-box",
        }}
      >
        {/* 移動する白い楕円ピル (Sliding Pill) */}
        <div
          data-testid="tab-sliding-pill"
          style={{
            position: "absolute",
            top: pillStyle.top,
            left: 0,
            transform: `translate3d(${pillStyle.left}px, 0, 0)`,
            width: pillStyle.width,
            height: pillStyle.height,
            background: C.white,
            borderRadius: "9999px",
            boxShadow: "0 1px 4px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.04)",
            transition: pillStyle.ready
              ? "transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), width 0.28s cubic-bezier(0.16, 1, 0.3, 1)"
              : "none",
            pointerEvents: "none",
            zIndex: 0,
            opacity: pillStyle.width > 0 ? 1 : 0,
          }}
        />

        {/* 各タスクグループタブ */}
        {categories.map((cat) => {
          const isActive = activeListId === cat.id;
          return (
            <div
              key={cat.id}
              ref={(el) => {
                if (el) tabItemRefs.current.set(cat.id, el);
                else tabItemRefs.current.delete(cat.id);
              }}
              style={{
                position: "relative",
                zIndex: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "9999px",
                padding: "0.38rem 0.95rem",
                minWidth: "auto",
                gap: "0.35rem",
                flexShrink: 0,
                boxSizing: "border-box",
              }}
            >
              <button
                type="button"
                data-testid={`tab-${cat.id}`}
                onClick={() => setActiveListId(cat.id)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "0.82rem",
                  fontWeight: isActive ? 650 : 450,
                  color: isActive ? C.charcoal : C.charcoalLight,
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  minWidth: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {cat.id === "shopping" && <span style={{ marginRight: "4px", flexShrink: 0 }}>🛒</span>}
                {cat.id === "default" && <span style={{ marginRight: "4px", flexShrink: 0 }}>✦</span>}
                <span
                  style={{
                    maxWidth: "200px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={cat.title}
                >
                  {cat.title}
                </span>
              </button>

              {/* カスタムリストの編集・設定トリガー */}
              {!cat.isDefault && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingCategory({ ...cat });
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "0 0.15rem",
                    cursor: "pointer",
                    color: C.charcoalLight,
                    lineHeight: 1,
                    display: "flex",
                    alignItems: "center",
                    flexShrink: 0,
                    opacity: isActive ? 0.85 : 0.5,
                  }}
                  title="リスト設定"
                >
                  <PencilIcon />
                </button>
              )}
            </div>
          );
        })}

        {/* ＋ 新しいリスト追加ボタン（右端にシームレス配置） */}
        <button
          type="button"
          data-testid="add-list-tab-btn"
          onClick={() => setShowAddListModal(true)}
          style={{
            position: "relative",
            zIndex: 1,
            border: "none",
            borderRadius: "9999px",
            background: "transparent",
            padding: "0.38rem 0.85rem",
            fontSize: "0.76rem",
            fontWeight: 600,
            color: C.goldDark,
            cursor: "pointer",
            flexShrink: 0,
            whiteSpace: "nowrap",
            transition: "opacity 0.15s ease",
          }}
        >
          ＋ 新しいリスト
        </button>
      </div>

      {/* ─── 入力フォーム（自然言語推論プレビュー付き） ─── */}
      <div style={{ marginBottom: "2.2rem" }}>
        <div
          className="arca-card"
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0.6rem 0.95rem",
            gap: "0.5rem",
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
            overflow: "hidden",
            borderRadius: "14px",
          }}
        >
          {/* テキスト入力欄 */}
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
              maxWidth: "120px",
              background: "rgba(0, 0, 0, 0.03)",
              borderRadius: "8px",
              padding: "0.35rem 0.5rem",
              border: "none",
              outline: "none",
              fontSize: "0.75rem",
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
              padding: "0.45rem 0.95rem",
              fontSize: "0.8rem",
              fontWeight: 650,
              cursor: titleInput.trim() ? "pointer" : "default",
              transition: "all 0.15s ease",
              minWidth: "46px",
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
            padding: "0.8rem 1.1rem",
            borderRadius: "16px",
          }}
        >
          {pending.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight, textAlign: "center", padding: "2.2rem 0" }}>
              タスクはありません
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
              {pending.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  onClickRow={(t) => setDetailTask(t)}
                  onDelete={handleDeleteTask}
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
                padding: "0.8rem 1.1rem",
                borderRadius: "16px",
                opacity: 0.85,
              }}
            >
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                {done.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={handleToggle}
                    onClickRow={(t) => setDetailTask(t)}
                    onDelete={handleDeleteTask}
                  />
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ─── PM（予防保全）セクション ─── */}
        <PMSection />

      </div>

      {/* ─── タスク詳細編集モーダル ─── */}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          categories={categories}
          isOpen={true}
          onClose={() => setDetailTask(null)}
          onSave={handleSaveDetail}
          onDelete={handleDeleteTask}
        />
      )}

      {/* ─── 新規リスト作成モーダル ─── */}
      {showAddListModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "rgba(0, 0, 0, 0.45)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
          onClick={() => setShowAddListModal(false)}
        >
          <div
            className="arca-card"
            style={{
              width: "100%",
              maxWidth: "380px",
              background: C.white,
              borderRadius: "18px",
              padding: "1.4rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
              boxShadow: "0 16px 40px rgba(0,0,0,0.16)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: C.charcoal }}>
                新しいリストを作成
              </h3>
              <span style={{ fontSize: "0.72rem", color: newListName.length >= MAX_LIST_NAME_LENGTH ? C.danger : C.charcoalLight }}>
                {newListName.length}/{MAX_LIST_NAME_LENGTH}
              </span>
            </div>
            <input
              type="text"
              value={newListName}
              maxLength={MAX_LIST_NAME_LENGTH}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateList();
              }}
              placeholder={`リスト名（最大${MAX_LIST_NAME_LENGTH}文字）`}
              autoFocus
              style={{
                width: "100%",
                padding: "0.65rem 0.85rem",
                borderRadius: "12px",
                border: "1px solid rgba(0, 0, 0, 0.08)",
                background: C.ivory,
                fontSize: "0.9rem",
                color: C.charcoal,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "0.3rem" }}>
              <button
                type="button"
                onClick={() => setShowAddListModal(false)}
                style={{
                  background: "rgba(0,0,0,0.05)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.5rem 0.9rem",
                  fontSize: "0.8rem",
                  color: C.charcoalMid,
                  cursor: "pointer",
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleCreateList}
                disabled={!newListName.trim()}
                style={{
                  background: C.gold,
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.5rem 1.1rem",
                  fontSize: "0.8rem",
                  fontWeight: 650,
                  color: "#FDFCFA",
                  cursor: !newListName.trim() ? "default" : "pointer",
                  opacity: !newListName.trim() ? 0.6 : 1,
                }}
              >
                作成する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── リスト編集・削除モーダル ─── */}
      {editingCategory && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "rgba(0, 0, 0, 0.45)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
          onClick={() => setEditingCategory(null)}
        >
          <div
            className="arca-card"
            style={{
              width: "100%",
              maxWidth: "380px",
              background: C.white,
              borderRadius: "18px",
              padding: "1.4rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
              boxShadow: "0 16px 40px rgba(0,0,0,0.16)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: C.charcoal }}>
                リスト設定
              </h3>
              <span style={{ fontSize: "0.72rem", color: editingCategory.title.length >= MAX_LIST_NAME_LENGTH ? C.danger : C.charcoalLight }}>
                {editingCategory.title.length}/{MAX_LIST_NAME_LENGTH}
              </span>
            </div>
            <input
              type="text"
              value={editingCategory.title}
              maxLength={MAX_LIST_NAME_LENGTH}
              onChange={(e) =>
                setEditingCategory({ ...editingCategory, title: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameList();
              }}
              style={{
                width: "100%",
                padding: "0.65rem 0.85rem",
                borderRadius: "12px",
                border: "1px solid rgba(0, 0, 0, 0.08)",
                background: C.ivory,
                fontSize: "0.9rem",
                color: C.charcoal,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.3rem" }}>
              <button
                type="button"
                onClick={() => setShowDeleteListConfirm(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: C.danger,
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "0.4rem 0",
                }}
              >
                リストを削除
              </button>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  style={{
                    background: "rgba(0,0,0,0.05)",
                    border: "none",
                    borderRadius: "8px",
                    padding: "0.5rem 0.9rem",
                    fontSize: "0.8rem",
                    color: C.charcoalMid,
                    cursor: "pointer",
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleRenameList}
                  style={{
                    background: C.gold,
                    border: "none",
                    borderRadius: "8px",
                    padding: "0.5rem 1.1rem",
                    fontSize: "0.8rem",
                    fontWeight: 650,
                    color: "#FDFCFA",
                    cursor: "pointer",
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── リスト削除確認ポップアップ ─── */}
      {showDeleteListConfirm && editingCategory && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1300,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
          onClick={() => setShowDeleteListConfirm(false)}
        >
          <div
            className="arca-card"
            style={{
              width: "100%",
              maxWidth: "360px",
              background: C.white,
              borderRadius: "18px",
              padding: "1.4rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.8rem",
              boxShadow: "0 20px 48px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 700, color: C.charcoal }}>
              「{editingCategory.title}」を削除しますか？
            </h4>
            <p style={{ margin: 0, fontSize: "0.82rem", color: C.charcoalLight, lineHeight: 1.5 }}>
              リスト内のタスクもすべて削除されます。よろしいですか？
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "0.4rem" }}>
              <button
                type="button"
                onClick={() => setShowDeleteListConfirm(false)}
                style={{
                  background: "rgba(0,0,0,0.05)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.5rem 0.9rem",
                  fontSize: "0.8rem",
                  color: C.charcoalMid,
                  cursor: "pointer",
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleDeleteList}
                style={{
                  background: C.danger,
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.5rem 1.1rem",
                  fontSize: "0.8rem",
                  fontWeight: 650,
                  color: "#FFFFFF",
                  cursor: "pointer",
                }}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 共通 Undo トースト ─── */}
      <UndoToast toast={toast} onUndo={triggerUndo} onDismiss={dismissToast} />
    </div>
  );
}
