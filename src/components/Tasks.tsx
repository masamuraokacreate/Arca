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
  setDoc,
  writeBatch,
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
  batchRemoveTasksFromGoogleTasks,
  pushSubTaskToGoogleTasks,
  pushSubTaskStatusToGoogleTasks,
  pushSubTaskUpdateToGoogleTasks,
  removeSubTaskFromGoogleTasks,
  createGoogleTaskList,
  renameGoogleTaskList,
  deleteGoogleTaskList,
  SHOPPING_LIST_NAMES,
} from "../services/googleTasksSync";
import { parseTaskInput } from "../lib/aetherCore";
import type { TaskItem, TaskListCategory, SyncStatus } from "../types";
import { C } from "../lib/designSystem";
import { useUndoToast } from "../hooks/useUndoToast";
import { UndoToast } from "./common/UndoToast";
import { PMSection } from "./tasks/PMSection";
import { TaskDetailModal } from "./tasks/TaskDetailModal";
import { ConfirmModal } from "./notes/ConfirmModal";
import { ListIcon, ListIconPicker, type ListIconId } from "./common/ListIcon";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { logger } from "../services/loggerService";

export interface TasksProps {
  initialTab?: string;
}

type Task = TaskItem;

// ── 初期デフォルトカテゴリ ──
const DEFAULT_CATEGORIES: TaskListCategory[] = [
  { id: "default", title: "マイタスク", isDefault: true, icon: "sparkle" },
  { id: "shopping", title: "買い物リスト", icon: "cart" },
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
  onSync,
}: {
  isReady: boolean;
  isSignedIn: boolean;
  syncStatus: SyncStatus;
  onSignIn: () => void;
  onSignOut: () => void;
  onSync: () => void;
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
        <button
          type="button"
          onClick={onSync}
          disabled={syncStatus === "syncing"}
          data-testid="manual-sync-btn"
          style={{
            background: "var(--bg-nav-track)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "7px",
            padding: "0.18rem 0.55rem",
            fontSize: "0.68rem",
            fontWeight: 600,
            color: syncStatus === "syncing" ? C.goldDark : C.charcoalMid,
            cursor: syncStatus === "syncing" ? "default" : "pointer",
            transition: "all 0.15s ease",
            lineHeight: 1.2,
          }}
          title="今すぐGoogle Tasksと相互同期する"
        >
          {syncStatus === "syncing" ? "同期中…" : "今すぐ同期"}
        </button>
        <span style={{ fontSize: "0.72rem", color: statusColor, fontWeight: 500, letterSpacing: "0.02em" }}>
          {statusLabel}
        </span>
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

// ---------- タスク行（クリック領域完全分離・直接削除ボタン・サブタスクインセットコンテナ付き） ----------
function TaskRow({
  task,
  isLast = false,
  onToggle,
  onClickRow,
  onDelete,
  onToggleSubTask,
  onAddSubTask,
}: {
  task: Task;
  isLast?: boolean;
  onToggle: (task: Task) => void;
  onClickRow: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleSubTask?: (task: Task, subTaskId: string) => void;
  onAddSubTask?: (task: Task, title: string) => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const subtasks = task.subtasks || [];
  const totalSubtasks = subtasks.length;
  const completedSubtasks = subtasks.filter((s) => s.completed).length;
  const hasSubtasks = totalSubtasks > 0;

  const handleStartAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAddingSubtask(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleCancelAdd = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsAddingSubtask(false);
    setNewSubtaskTitle("");
  };

  const handleSubmitSubtask = (e?: React.FormEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const trimmed = newSubtaskTitle.trim();
    if (trimmed && onAddSubTask) {
      onAddSubTask(task, trimmed);
    }
    setNewSubtaskTitle("");
    setIsAddingSubtask(false);
  };

  return (
    <li
      onClick={() => onClickRow(task)}
      data-testid="task-item-row"
      style={{
        display: "flex",
        flexDirection: "column",
        borderBottom: isLast ? "none" : "1px solid rgba(0, 0, 0, 0.04)",
        borderRadius: "10px",
        transition: "background 0.15s ease",
      }}
    >
      {/* ─── メインタスク行 ─── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.55rem",
          padding: "0.85rem 0.6rem",
          opacity: task.completed ? 0.45 : 1,
          transition: "opacity 0.2s ease, background 0.15s ease",
          cursor: "pointer",
          borderRadius: "10px",
        }}
      >
        {/* ─── 開閉トグルアイコン（サブタスクがある場合のみ表示、ない場合は同じ幅のプレースホルダー） ─── */}
        {hasSubtasks ? (
          <button
            type="button"
            data-testid="subtask-collapse-btn"
            aria-label={isCollapsed ? "サブタスクを展開" : "サブタスクを折りたたむ"}
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed((prev) => !prev);
            }}
            style={{
              background: "none",
              border: "none",
              padding: "0.2rem",
              margin: "-0.2rem",
              cursor: "pointer",
              lineHeight: 0,
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: C.charcoalLight,
              borderRadius: "6px",
              appearance: "none",
              transition: "color 0.15s ease, background 0.15s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = C.charcoal;
              (e.currentTarget as HTMLElement).style.background = "rgba(0, 0, 0, 0.04)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = C.charcoalLight;
              (e.currentTarget as HTMLElement).style.background = "none";
            }}
            title={isCollapsed ? "サブタスクを展開" : "サブタスクを折りたたむ"}
          >
            {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
        ) : (
          <div style={{ width: "32px", height: "32px", flexShrink: 0 }} />
        )}

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
            minWidth: "36px",
            minHeight: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            appearance: "none",
          }}
          title={task.completed ? "未完了に戻す" : "完了にする"}
        >
          <CheckCircle completed={task.completed} />
        </button>

        {/* ─── タスクタイトル ─── */}
        <span
          style={{
            flex: 1,
            minWidth: 0,
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
              data-testid="subtask-progress-badge"
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: completedSubtasks === totalSubtasks ? C.sage : C.charcoalMid,
                background: completedSubtasks === totalSubtasks ? "rgba(107, 142, 111, 0.12)" : "rgba(0, 0, 0, 0.04)",
                padding: "0.15rem 0.5rem",
                borderRadius: "6px",
                whiteSpace: "nowrap",
                letterSpacing: "0.02em",
              }}
              title={`${totalSubtasks}件中${completedSubtasks}件完了`}
            >
              {completedSubtasks}/{totalSubtasks} 完了
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
              data-testid="due-date-badge"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.2rem",
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

          {/* 行内ゴミ箱ボタン（クリック領域完全分離・即時削除） */}
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
              lineHeight: 0,
              color: C.charcoalXLight,
              borderRadius: "5px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.15s ease, background 0.15s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = C.danger;
              (e.currentTarget as HTMLElement).style.background = "rgba(224, 86, 74, 0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = C.charcoalXLight;
              (e.currentTarget as HTMLElement).style.background = "none";
            }}
            title="タスクを削除"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* ─── インセット・コンテナ方式のサブタスク領域（デフォルト展開・トグル開閉） ─── */}
      {hasSubtasks && !isCollapsed && (
        <ul
          data-testid="subtask-list"
          style={{
            listStyle: "none",
            margin: "0.35rem 0.5rem 0.6rem 2.2rem",
            padding: "0.5rem 0.65rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            backgroundColor: "var(--bg-nav-track, rgba(0, 0, 0, 0.03))",
            borderRadius: "12px",
            border: "none",
          }}
        >
          {subtasks.map((st) => (
            <li
              key={st.id}
              data-testid="subtask-item-row"
              onClick={() => onClickRow(task)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.55rem",
                minHeight: "40px",
                padding: "0.35rem 0.45rem",
                borderRadius: "8px",
                cursor: "pointer",
                opacity: st.completed || task.completed ? 0.55 : 1,
                transition: "opacity 0.15s ease, background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(0, 0, 0, 0.035)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {/* サブタスク用チェックボタン */}
              <button
                type="button"
                data-testid={`subtask-toggle-btn-${st.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSubTask?.(task, st.id);
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: "0.2rem",
                  margin: "-0.2rem",
                  cursor: "pointer",
                  lineHeight: 0,
                  minWidth: "32px",
                  minHeight: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  appearance: "none",
                }}
                title={st.completed ? "未完了に戻す" : "完了にする"}
              >
                <CheckCircle completed={st.completed} size="1.05rem" />
              </button>

              {/* サブタスクタイトル */}
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: "0.85rem",
                  fontWeight: 400,
                  color: st.completed ? C.charcoalLight : C.charcoalMid,
                  textDecoration: st.completed ? "line-through" : "none",
                  letterSpacing: "0.01em",
                  lineHeight: 1.35,
                  wordBreak: "break-word",
                }}
              >
                {st.title}
              </span>
            </li>
          ))}

          {/* ─── インラインサブタスク追加導線 ─── */}
          <li
            style={{
              marginTop: "0.15rem",
              padding: "0.1rem 0.2rem",
            }}
          >
            {isAddingSubtask ? (
              <form
                onSubmit={handleSubmitSubtask}
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: "var(--bg-card-solid, #ffffff)",
                  padding: "0.3rem 0.5rem",
                  borderRadius: "8px",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.06)",
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      handleCancelAdd();
                    }
                  }}
                  placeholder="サブタスクを入力..."
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: "none",
                    outline: "none",
                    fontSize: "0.85rem",
                    color: C.charcoal,
                    background: "transparent",
                    padding: "0.2rem 0.3rem",
                  }}
                />
                <button
                  type="submit"
                  disabled={!newSubtaskTitle.trim()}
                  style={{
                    border: "none",
                    background: newSubtaskTitle.trim() ? C.gold : "rgba(0, 0, 0, 0.08)",
                    color: newSubtaskTitle.trim() ? "#ffffff" : C.charcoalLight,
                    borderRadius: "6px",
                    padding: "0.25rem 0.6rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: newSubtaskTitle.trim() ? "pointer" : "default",
                    transition: "all 0.15s ease",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.2rem",
                  }}
                >
                  追加
                </button>
                <button
                  type="button"
                  onClick={handleCancelAdd}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: C.charcoalLight,
                    padding: "0.25rem",
                    cursor: "pointer",
                    lineHeight: 0,
                    borderRadius: "4px",
                  }}
                  title="キャンセル"
                >
                  <X size={14} />
                </button>
              </form>
            ) : (
              <button
                type="button"
                data-testid="add-subtask-inline-btn"
                onClick={handleStartAdd}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  background: "transparent",
                  border: "none",
                  padding: "0.35rem 0.5rem",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  color: C.charcoalMid,
                  cursor: "pointer",
                  borderRadius: "6px",
                  minHeight: "36px",
                  transition: "color 0.15s ease, background 0.15s ease",
                  appearance: "none",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = C.goldDark;
                  (e.currentTarget as HTMLElement).style.background = "rgba(0, 0, 0, 0.03)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = C.charcoalMid;
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <Plus size={14} />
                <span>サブタスクを追加</span>
              </button>
            )}
          </li>
        </ul>
      )}
    </li>
  );
}

function resolveListId(tab?: string): string {
  if (!tab || tab === "tasks" || tab === "default") return "default";
  if (tab === "lists") return "shopping";
  return tab;
}

// ---------- メインコンポーネント ----------
export default function Tasks({ initialTab = "default" }: TasksProps = {}) {
  const [categories, setCategories] = useState<TaskListCategory[]>(DEFAULT_CATEGORIES);
  const [activeListId, setActiveListId] = useState<string>(() => resolveListId(initialTab));

  // initialTab プロパティ変更時の同期
  useEffect(() => {
    setActiveListId(resolveListId(initialTab));
  }, [initialTab]);

  // categories 読み込み後、存在しない ID が選択されていたらマイタスク ("default") に自動復旧
  useEffect(() => {
    if (categories.length > 0 && !categories.some((c) => c.id === activeListId)) {
      setActiveListId("default");
    }
  }, [categories, activeListId]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [titleInput, setTitleInput] = useState("");
  const [dueInput, setDueInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  // 完了済みタスク一括削除時の楽観的除外用 Ref（Firestoreスナップショットの遅延反映によるチラつき・ゾンビ復活を完全防止）
  const clearingTaskIdsRef = useRef<Set<string>>(new Set());

  // 詳細編集モーダル用 State
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  // リスト作成・編集モーダル用 State
  const [showAddListModal, setShowAddListModal] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListIcon, setNewListIcon] = useState<ListIconId>("folder");
  const [editingCategory, setEditingCategory] = useState<TaskListCategory | null>(null);
  const [showDeleteListConfirm, setShowDeleteListConfirm] = useState(false);
  const listMetaMapRef = useRef<Record<string, { icon?: string }>>({});

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
  }>({ left: 0, top: 0, width: 0, height: 0, ready: false });

  const { isReady, isSignedIn, accessToken, signIn, signOut } = useGoogleAuth();
  const { toast, showUndoToast, dismissToast, triggerUndo } = useUndoToast<Task>();

  // Sliding Pill の位置・サイズ計算
  const updatePill = useCallback(() => {
    const activeEl = tabItemRefs.current.get(activeListId);
    if (!activeEl) return;

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

  // ---------- Firestore リアルタイム購読（タスク） ＆ 重複クレンジング ----------
  useEffect(() => {
    const q = query(collection(db, "tasks"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) => {
      const rawTasks = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Task, "id">),
      }));

      // 重複クレンジング（同一 id および同一 googleTaskId を持つ重複データを安全に除外）
      const seenIds = new Set<string>();
      const seenGoogleTaskIds = new Set<string>();
      const sanitizedTasks: Task[] = [];

      for (const t of rawTasks) {
        // 削除中タスクはUIに再表示させない
        if (clearingTaskIdsRef.current.has(t.id)) continue;

        if (seenIds.has(t.id)) continue;
        seenIds.add(t.id);

        if (t.googleTaskId) {
          if (seenGoogleTaskIds.has(t.googleTaskId)) continue;
          seenGoogleTaskIds.add(t.googleTaskId);
        }

        // 旧ランダム listId の自動修復（googleListId が存在し、default / shopping 以外で不一致の場合）
        if (t.googleListId && t.listId && t.listId.startsWith("list-") && t.listId !== t.googleListId) {
          updateDoc(doc(db, "tasks", t.id), { listId: t.googleListId }).catch(() => {});
          t.listId = t.googleListId;
        }

        sanitizedTasks.push(t);
      }

      setTasks(sanitizedTasks);
    });
  }, []);

  // ---------- Firestore リアルタイム購読（リストメタデータ・カスタムアイコン） ----------
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "task_lists"), (snapshot) => {
      const metaMap: Record<string, { icon?: string }> = {};
      snapshot.docs.forEach((d) => {
        const data = d.data();
        if (data.icon) {
          metaMap[d.id] = { icon: data.icon };
        }
      });
      listMetaMapRef.current = metaMap;

      // 現在のカテゴリStateにFirestoreのアイコン設定を反映
      setCategories((prev) =>
        prev.map((c) => {
          const m = metaMap[c.id];
          return m?.icon ? { ...c, icon: m.icon } : c;
        })
      );
    });

    return () => unsub();
  }, []);

  // カテゴリ用アイコン決定ヘルパー（Firestoreの保存設定優先、無ければフォールバック）
  const getCategoryIcon = useCallback((catId: string, isShop: boolean, isMyTasks: boolean): string => {
    const saved = listMetaMapRef.current[catId]?.icon;
    if (saved) return saved;
    if (isShop) return "cart";
    if (isMyTasks) return "sparkle";
    return "folder";
  }, []);

  // ---------- Google Tasks リスト & タスク同期関数 ----------
  const lastSyncTimeRef = useRef<number>(0);

  const runSync = useCallback(async (isManual = false) => {
    if (!isSignedIn || !accessToken) return;

    // 短時間の重複同期防止（手動実行でない場合は前回から15秒以上空ける）
    const now = Date.now();
    if (!isManual && now - lastSyncTimeRef.current < 15000) return;
    lastSyncTimeRef.current = now;

    try {
      setSyncStatus("syncing");
      const gLists: GTaskList[] = await getTaskLists(accessToken);
      if (!gLists || gLists.length === 0) {
        setSyncStatus("idle");
        return;
      }

      // Google Tasks のリストをカテゴリにマッピング
      const mappedCategories: TaskListCategory[] = [];
      for (const gl of gLists) {
        const isMyTasks = gl.title === "My Tasks" || gl.title === "マイタスク" || gl.id === "@default";
        const isShop = SHOPPING_LIST_NAMES.some((name) => gl.title.trim() === name);

        if (isMyTasks) {
          mappedCategories.push({
            id: "default",
            title: "マイタスク",
            googleListId: gl.id,
            isDefault: true,
            icon: getCategoryIcon("default", false, true),
          });
        } else if (isShop) {
          mappedCategories.push({
            id: "shopping",
            title: gl.title,
            googleListId: gl.id,
            icon: getCategoryIcon("shopping", true, false),
          });
        } else {
          mappedCategories.push({
            id: gl.id,
            title: gl.title,
            googleListId: gl.id,
            icon: getCategoryIcon(gl.id, false, false),
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
        uniqueCategories.unshift({
          ...DEFAULT_CATEGORIES[0],
          icon: getCategoryIcon("default", false, true),
        });
      }
      if (!uniqueCategories.some((u) => u.id === "shopping")) {
        uniqueCategories.push({
          ...DEFAULT_CATEGORIES[1],
          icon: getCategoryIcon("shopping", true, false),
        });
      }

      setCategories(uniqueCategories);

      // 各カテゴリのタスクを同期（サブタスクおよび孤立タスクのクレンジング含む）
      for (const cat of uniqueCategories) {
        if (cat.googleListId) {
          await syncGoogleTasksForList(accessToken, cat.googleListId, cat.id);
        }
      }

      setSyncStatus("done");
      setTimeout(() => {
        setSyncStatus("idle");
      }, 3000);
    } catch (err) {
      console.error("Google Tasks sync failed:", err);
      setSyncStatus("error");
    }
  }, [isSignedIn, accessToken, getCategoryIcon]);

  // Google Tasks リストカテゴリの取得（タスク同期はApp.tsx起動時に一括完了済みのためカテゴリ一覧のみ軽量に取得）
  useEffect(() => {
    if (!isSignedIn || !accessToken) return;
    let isMounted = true;

    getTaskLists(accessToken)
      .then((gLists) => {
        if (!isMounted || !gLists || gLists.length === 0) return;

        const mappedCategories: TaskListCategory[] = [];
        for (const gl of gLists) {
          const isMyTasks = gl.title === "My Tasks" || gl.title === "マイタスク" || gl.id === "@default";
          const isShop = SHOPPING_LIST_NAMES.some((name) => gl.title.trim() === name);

          if (isMyTasks) {
            mappedCategories.push({
              id: "default",
              title: "マイタスク",
              googleListId: gl.id,
              isDefault: true,
              icon: getCategoryIcon("default", false, true),
            });
          } else if (isShop) {
            mappedCategories.push({
              id: "shopping",
              title: gl.title,
              googleListId: gl.id,
              icon: getCategoryIcon("shopping", true, false),
            });
          } else {
            mappedCategories.push({
              id: gl.id,
              title: gl.title,
              googleListId: gl.id,
              icon: getCategoryIcon(gl.id, false, false),
            });
          }
        }

        const uniqueCategories: TaskListCategory[] = [];
        for (const cat of mappedCategories) {
          if (!uniqueCategories.some((u) => u.id === cat.id)) {
            uniqueCategories.push(cat);
          }
        }
        if (!uniqueCategories.some((u) => u.id === "default")) {
          uniqueCategories.unshift({
            ...DEFAULT_CATEGORIES[0],
            icon: getCategoryIcon("default", false, true),
          });
        }
        if (!uniqueCategories.some((u) => u.id === "shopping")) {
          uniqueCategories.push({
            ...DEFAULT_CATEGORIES[1],
            icon: getCategoryIcon("shopping", true, false),
          });
        }

        setCategories(uniqueCategories);
      })
      .catch((err) => {
        console.warn("Failed to load task categories:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [isSignedIn, accessToken, getCategoryIcon]);

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
      const targetListId =
        activeListId === "default"
          ? "default"
          : activeListId === "shopping"
          ? "shopping"
          : currentCategory?.googleListId || activeListId;
      let googleTaskId: string | undefined;

      if (isSignedIn && accessToken && currentCategory?.googleListId) {
        try {
          googleTaskId = await pushTaskToGoogleTasks(
            accessToken,
            currentCategory.googleListId,
            finalTitle,
            finalDue,
            undefined,
            finalPriority
          );
        } catch (gErr) {
          console.error("Failed to add task to Google Tasks:", gErr);
        }
      }

      const docId = googleTaskId || "task-" + Math.random().toString(36).slice(2, 9);
      await setDoc(doc(db, "tasks", docId), {
        title: finalTitle,
        dueDate: finalDue,
        priority: finalPriority,
        notes: "",
        completed: false,
        listId: targetListId,
        googleTaskId: googleTaskId || null,
        googleListId: currentCategory?.googleListId || null,
        subtasks: [],
        createdAt: serverTimestamp(),
      });
      logger.info("firestore", `Tasks: Created task "${finalTitle}"`, {
        id: docId,
        dueDate: finalDue,
        priority: finalPriority,
        listId: targetListId,
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
      let updatedSubtasks = task.subtasks;

      // 親タスクを完了にした場合、配下の未完了サブタスクも連動して一括完了にする
      if (next && task.subtasks && task.subtasks.length > 0) {
        const hasUncompleted = task.subtasks.some((st) => !st.completed);
        if (hasUncompleted) {
          updatedSubtasks = task.subtasks.map((st) => ({ ...st, completed: true }));
        }
      }

      // 楽観的ローカル更新
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, completed: next, subtasks: updatedSubtasks }
            : t
        )
      );

      const updateData: Partial<TaskItem> = { completed: next };
      if (updatedSubtasks !== task.subtasks) {
        updateData.subtasks = updatedSubtasks;
      }

      await updateDoc(doc(db, "tasks", task.id), updateData);
      logger.info("firestore", `Tasks: Toggled task "${task.title}" (${next ? "completed" : "pending"})`, {
        id: task.id,
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

          // 連動完了したサブタスクのGoogle Tasks同期
          if (next && updatedSubtasks && updatedSubtasks !== task.subtasks) {
            for (const st of updatedSubtasks) {
              if (st.googleTaskId) {
                try {
                  await pushSubTaskStatusToGoogleTasks(
                    accessToken,
                    targetGoogleListId,
                    st.googleTaskId,
                    true
                  );
                } catch (subErr) {
                  console.warn("Failed to update Google SubTask status:", subErr);
                }
              }
            }
          }
        }
      }
    },
    [isSignedIn, accessToken, categories]
  );

  // ---------- サブタスク完了トグル ----------
  const handleToggleSubTask = useCallback(
    async (task: Task, subTaskId: string) => {
      const currentSubtasks = task.subtasks || [];
      const targetSub = currentSubtasks.find((s) => s.id === subTaskId);
      if (!targetSub) return;

      const next = !targetSub.completed;
      const updatedSubtasks = currentSubtasks.map((s) =>
        s.id === subTaskId ? { ...s, completed: next } : s
      );

      // 楽観的ローカル更新
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, subtasks: updatedSubtasks } : t))
      );

      // Firestore 更新
      try {
        await updateDoc(doc(db, "tasks", task.id), {
          subtasks: updatedSubtasks,
        });
      } catch (err) {
        console.error("Failed to update subtask in Firestore:", err);
      }

      // Google Tasks へのステータス同期
      if (isSignedIn && accessToken && targetSub.googleTaskId) {
        const cat = categories.find((c) => c.id === (task.listId || "default"));
        const targetGoogleListId = task.googleListId || cat?.googleListId;
        if (targetGoogleListId) {
          try {
            await pushSubTaskStatusToGoogleTasks(
              accessToken,
              targetGoogleListId,
              targetSub.googleTaskId,
              next
            );
          } catch (gErr) {
            console.warn("Failed to update Google SubTask status:", gErr);
          }
        }
      }
    },
    [isSignedIn, accessToken, categories]
  );

  // ---------- サブタスク追加 (インライン) ----------
  const handleAddSubTask = useCallback(
    async (task: Task, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;

      const newSubtask: NonNullable<Task["subtasks"]>[number] = {
        id: typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: trimmed,
        completed: false,
      };

      const updatedSubtasks = [...(task.subtasks || []), newSubtask];

      // 楽観的ローカル更新
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, subtasks: updatedSubtasks } : t))
      );

      // Google Tasks への新規サブタスク同期
      if (isSignedIn && accessToken && task.googleTaskId) {
        const cat = categories.find((c) => c.id === (task.listId || "default"));
        const targetGoogleListId = task.googleListId || cat?.googleListId;
        if (targetGoogleListId) {
          try {
            const gSubId = await pushSubTaskToGoogleTasks(
              accessToken,
              targetGoogleListId,
              task.googleTaskId,
              trimmed
            );
            newSubtask.googleTaskId = gSubId;
          } catch (gErr) {
            console.warn("Failed to push subtask to Google Tasks:", gErr);
          }
        }
      }

      // Firestore 更新
      try {
        await updateDoc(doc(db, "tasks", task.id), {
          subtasks: updatedSubtasks,
        });
      } catch (err) {
        console.error("Failed to add subtask in Firestore:", err);
      }
    },
    [isSignedIn, accessToken, categories]
  );

  // ---------- タスク詳細保存 ----------
  const handleSaveDetail = useCallback(
    async (updatedTask: Task) => {
      let finalSubtasks = updatedTask.subtasks || [];

      if (isSignedIn && accessToken && updatedTask.googleTaskId) {
        const cat = categories.find((c) => c.id === (updatedTask.listId || "default"));
        const targetGoogleListId = updatedTask.googleListId || cat?.googleListId;
        if (targetGoogleListId) {
          try {
            // 親タスク自体の更新（メモと優先度もGoogle Tasksへ完全同期）
            await pushTaskUpdateToGoogleTasks(
              accessToken,
              targetGoogleListId,
              updatedTask.googleTaskId,
              {
                title: updatedTask.title,
                dueDate: updatedTask.dueDate || null,
                notes: updatedTask.notes || null,
                priority: updatedTask.priority || "medium",
                completed: updatedTask.completed,
              }
            );

            // サブタスクの差分同期
            const origTask = tasks.find((t) => t.id === updatedTask.id);
            const origSubtasks = origTask?.subtasks || [];

            // 削除されたサブタスクを Google から削除
            for (const origSub of origSubtasks) {
              if (origSub.googleTaskId && !finalSubtasks.some((s) => s.googleTaskId === origSub.googleTaskId)) {
                try {
                  await removeSubTaskFromGoogleTasks(accessToken, targetGoogleListId, origSub.googleTaskId);
                } catch (delErr) {
                  console.warn("Failed to delete subtask from Google:", delErr);
                }
              }
            }

            // 新規・更新サブタスクの処理
            finalSubtasks = await Promise.all(
              finalSubtasks.map(async (st) => {
                if (!st.googleTaskId) {
                  // 新規サブタスク -> Google Tasks へ作成
                  try {
                    const gSubId = await pushSubTaskToGoogleTasks(
                      accessToken,
                      targetGoogleListId,
                      updatedTask.googleTaskId!,
                      st.title
                    );
                    if (st.completed) {
                      await pushSubTaskStatusToGoogleTasks(accessToken, targetGoogleListId, gSubId, true);
                    }
                    return { ...st, googleTaskId: gSubId };
                  } catch (addErr) {
                    console.warn("Failed to push subtask to Google:", addErr);
                    return st;
                  }
                } else {
                  // 既存サブタスク -> 状態やタイトルの差分があれば更新
                  const origSub = origSubtasks.find((s) => s.googleTaskId === st.googleTaskId);
                  if (origSub && (origSub.completed !== st.completed || origSub.title !== st.title)) {
                    try {
                      await pushSubTaskUpdateToGoogleTasks(accessToken, targetGoogleListId, st.googleTaskId, {
                        title: st.title,
                        completed: st.completed,
                      });
                    } catch (updateErr) {
                      console.warn("Failed to update subtask on Google:", updateErr);
                    }
                  }
                  return st;
                }
              })
            );
          } catch (gErr) {
            console.error("Failed to update Google Task:", gErr);
          }
        }
      }

      await updateDoc(doc(db, "tasks", updatedTask.id), {
        title: updatedTask.title,
        dueDate: updatedTask.dueDate || null,
        priority: updatedTask.priority || "medium",
        notes: updatedTask.notes || "",
        listId: updatedTask.listId || "default",
        subtasks: finalSubtasks,
        updatedAt: serverTimestamp(),
      });
    },
    [isSignedIn, accessToken, categories, tasks]
  );

  // ---------- タスク削除（Undo対応） ----------
  const handleDeleteTask = useCallback(
    async (task: Task) => {
      try {
        await deleteDoc(doc(db, "tasks", task.id));
        logger.info("firestore", `Tasks: Deleted task "${task.title}" (${task.id})`);

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
            const newRef = await addDoc(collection(db, "tasks"), {
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
            logger.info("firestore", `Tasks: Restored task "${restoredTask.title}" (${newRef.id})`);
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

    const newId = googleListId || "list-" + Math.random().toString(36).slice(2, 9);
    const chosenIcon = newListIcon || "folder";
    const newCat: TaskListCategory = {
      id: newId,
      title,
      googleListId: googleListId || newId,
      icon: chosenIcon,
    };

    // Firestore にリストメタデータを永続保存
    try {
      await setDoc(
        doc(db, "task_lists", newId),
        {
          id: newId,
          icon: chosenIcon,
          title,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      listMetaMapRef.current[newId] = { icon: chosenIcon };
      logger.info("firestore", `Tasks: Created task list "${title}" (${newId})`);
    } catch (err) {
      console.warn("Failed to persist task list metadata:", err);
    }

    setCategories((prev) => [...prev, newCat]);
    setActiveListId(newId);
    setNewListName("");
    setNewListIcon("folder");
    setShowAddListModal(false);
  };

  // ---------- リスト設定更新（名前＆アイコン） ----------
  const handleUpdateList = async () => {
    if (!editingCategory) return;
    const title = editingCategory.title.trim().slice(0, MAX_LIST_NAME_LENGTH);
    if (!title && !editingCategory.isDefault) return;

    const finalTitle = editingCategory.isDefault ? editingCategory.title : title;
    const finalIcon = editingCategory.icon || (editingCategory.id === "shopping" ? "cart" : "sparkle");

    // Google Tasks 側のタイトル更新（デフォルトリスト以外）
    if (!editingCategory.isDefault && isSignedIn && accessToken && editingCategory.googleListId) {
      try {
        await renameGoogleTaskList(accessToken, editingCategory.googleListId, finalTitle);
      } catch (err) {
        console.error("Failed to rename Google TaskList:", err);
      }
    }

    // Firestore にリストメタデータ（アイコン等）を永続保存
    try {
      await setDoc(
        doc(db, "task_lists", editingCategory.id),
        {
          id: editingCategory.id,
          icon: finalIcon,
          title: finalTitle,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      listMetaMapRef.current[editingCategory.id] = { icon: finalIcon };
      logger.info("firestore", `Tasks: Updated task list "${finalTitle}" (${editingCategory.id})`);
    } catch (err) {
      console.warn("Failed to update task list metadata:", err);
    }

    setCategories((prev) =>
      prev.map((c) =>
        c.id === editingCategory.id
          ? { ...editingCategory, title: finalTitle, icon: finalIcon }
          : c
      )
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

    // 3. Firestore からリストメタデータを削除
    try {
      await deleteDoc(doc(db, "task_lists", listIdToDelete));
      delete listMetaMapRef.current[listIdToDelete];
      logger.info("firestore", `Tasks: Deleted task list "${editingCategory.title}" (${listIdToDelete}), removed ${tasksToDelete.length} tasks`);
    } catch (err) {
      console.warn("Failed to delete task list metadata from Firestore:", err);
    }

    // 4. カテゴリState更新
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
  const currentCategory = categories.find((c) => c.id === activeListId);
  const currentTasks = tasks.filter((t) => {
    const taskListId = t.listId || "default";
    if (taskListId === activeListId) return true;
    // 互換性救済: 古いランダムIDまたはGoogleListIdのいずれかが一致する場合も許容
    if (
      currentCategory?.googleListId &&
      (t.googleListId === currentCategory.googleListId || taskListId === currentCategory.googleListId)
    ) {
      return true;
    }
    return false;
  });

  const pending = currentTasks.filter((t) => !t.completed).sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
  const done = currentTasks.filter((t) => t.completed);

  // ---------- 完了済みタスクの一括削除 ----------
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClearCompleted = useCallback(() => {
    if (done.length === 0) return;
    setShowClearConfirm(true);
  }, [done.length]);

  const executeClearCompleted = useCallback(() => {
    setShowClearConfirm(false);
    if (done.length === 0) return;

    const tasksToDelete = [...done];
    const count = tasksToDelete.length;
    const taskIdsToDelete = new Set(tasksToDelete.map((t) => t.id));

    // A. 楽観的UI更新（0ms）: 即座にフロントエンドの State から対象タスクを一括除外
    tasksToDelete.forEach((t) => clearingTaskIdsRef.current.add(t.id));
    setTasks((prev) => prev.filter((t) => !taskIdsToDelete.has(t.id)));

    // C. Apple HIG / UIの静けさ維持: 控えめなトースト通知を表示
    showUndoToast({
      message: `${count}件の完了済みタスクを削除しました`,
      item: null as any,
      onUndo: () => {},
    });

    // B. バックグラウンド削除処理の並行化・高速化（非同期・非ブロッキング実行）
    void (async () => {
      try {
        // 1. Firestore バッチ削除 (writeBatch で一括コミット)
        const FIRESTORE_BATCH_LIMIT = 400;
        for (let i = 0; i < tasksToDelete.length; i += FIRESTORE_BATCH_LIMIT) {
          const batch = writeBatch(db);
          const chunk = tasksToDelete.slice(i, i + FIRESTORE_BATCH_LIMIT);
          for (const t of chunk) {
            batch.delete(doc(db, "tasks", t.id));
          }
          await batch.commit();
        }

        // 2. Google Tasks API 並列削除 (Promise.allSettled によるチャンク並列)
        if (isSignedIn && accessToken) {
          const googleTasksWithList = tasksToDelete
            .filter((t) => t.googleTaskId)
            .map((t) => {
              const cat = categories.find((c) => c.id === (t.listId || "default"));
              const tasklistId = t.googleListId || cat?.googleListId;
              return tasklistId ? { tasklistId, googleTaskId: t.googleTaskId! } : null;
            })
            .filter((item): item is { tasklistId: string; googleTaskId: string } => item !== null);

          if (googleTasksWithList.length > 0) {
            await batchRemoveTasksFromGoogleTasks(accessToken, googleTasksWithList, 5);
          }
        }
      } catch (err) {
        console.warn("Failed to complete background deletion of tasks:", err);
      } finally {
        // 削除完了後、少し余裕を持ってガードセットから解除
        setTimeout(() => {
          tasksToDelete.forEach((t) => clearingTaskIdsRef.current.delete(t.id));
        }, 3000);
      }
    })();
  }, [done, showUndoToast, isSignedIn, accessToken, categories]);

  return (
    <div className="w-full max-w-3xl mx-auto" style={{ padding: "2.4rem 1.2rem 6rem", boxSizing: "border-box" }}>
      
      {/* ─── ヘッダー ─── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem", padding: "0 0.25rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 750, color: C.charcoal, margin: 0, letterSpacing: "-0.03em" }}>
            {categories.find((c) => c.id === activeListId)?.title || "タスク"}
          </h1>
        </div>

        <SyncBadge
          isReady={isReady}
          isSignedIn={isSignedIn}
          syncStatus={syncStatus}
          onSignIn={signIn}
          onSignOut={signOut}
          onSync={() => runSync(true)}
        />
      </div>

      {/* ─── 一体化タブ型セグメントコントロール（Sliding Pill アニメーション付き） ─── */}
      <div
        ref={tabTrackRef}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          background: "var(--bg-nav-track)",
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
            background: "var(--bg-nav-pill)",
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
                <ListIcon
                  icon={cat.icon || (cat.id === "shopping" ? "cart" : cat.id === "default" ? "sparkle" : "folder")}
                  size="0.88rem"
                  style={{
                    marginRight: "4px",
                    color: isActive ? "var(--text-main)" : C.charcoalLight,
                    opacity: isActive ? 1 : 0.65,
                    transition: "color 0.18s ease, opacity 0.18s ease",
                  }}
                />
                <span
                  style={{
                    maxWidth: "200px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: isActive ? "var(--text-main)" : C.charcoalLight,
                    transition: "color 0.18s ease",
                  }}
                  title={cat.title}
                >
                  {cat.title}
                </span>
              </button>

              {/* リスト設定トリガー（すべてのリストで設定可能。マイタスクはアイコンのみ変更可能） */}
              <button
                type="button"
                data-testid={`list-settings-btn-${cat.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingCategory({ ...cat });
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "0 0.15rem",
                  cursor: "pointer",
                  color: isActive ? "var(--text-main)" : C.charcoalLight,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                  opacity: isActive ? 0.85 : 0.45,
                }}
                title="リスト設定"
              >
                <PencilIcon />
              </button>
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
              background: "var(--bg-nav-track)",
              borderRadius: "8px",
              padding: "0.35rem 0.5rem",
              border: "1px solid var(--border-subtle)",
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
              {pending.map((task, index) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isLast={index === pending.length - 1}
                  onToggle={handleToggle}
                  onClickRow={(t) => setDetailTask(t)}
                  onDelete={handleDeleteTask}
                  onToggleSubTask={handleToggleSubTask}
                  onAddSubTask={handleAddSubTask}
                />
              ))}
            </ul>
          )}
        </div>

        {/* 完了済みタスク */}
        {done.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem", padding: "0 0.5rem" }}>
              <span style={{ fontSize: "0.72rem", color: C.charcoalLight, letterSpacing: "0.06em" }}>
                完了済み ({done.length})
              </span>
              <button
                type="button"
                data-testid="clear-completed-tasks-btn"
                onClick={handleClearCompleted}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "0.2rem 0.45rem",
                  fontSize: "0.72rem",
                  color: C.charcoalLight,
                  cursor: "pointer",
                  borderRadius: "6px",
                  transition: "color 0.15s ease",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = C.danger;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = C.charcoalLight;
                }}
                title="このリストの完了済みタスクを一括削除"
              >
                完了済みを一括削除
              </button>
            </div>
            <div
              className="arca-card"
              style={{
                padding: "0.8rem 1.1rem",
                borderRadius: "16px",
                opacity: 0.85,
              }}
            >
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                {done.map((task, index) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isLast={index === done.length - 1}
                    onToggle={handleToggle}
                    onClickRow={(t) => setDetailTask(t)}
                    onDelete={handleDeleteTask}
                    onToggleSubTask={handleToggleSubTask}
                    onAddSubTask={handleAddSubTask}
                  />
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ─── PM作業セクション（マイタスクグループのみ表示） ─── */}
        {activeListId === "default" && <PMSection />}

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
              background: "var(--bg-card-solid)",
              borderRadius: "18px",
              border: "1px solid var(--border-subtle)",
              padding: "1.4rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
              boxShadow: "var(--shadow-modal)",
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
                border: "1px solid var(--border-subtle)",
                background: C.white,
                fontSize: "0.9rem",
                color: C.charcoal,
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            {/* 12種類のSVGアイコン選択ピッカー */}
            <ListIconPicker
              selectedIcon={newListIcon}
              onSelectIcon={setNewListIcon}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "0.3rem" }}>
              <button
                type="button"
                onClick={() => setShowAddListModal(false)}
                style={{
                  background: "var(--bg-nav-track)",
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

      {/* ─── リスト編集・設定モーダル ─── */}
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
              background: "var(--bg-card-solid)",
              borderRadius: "18px",
              border: "1px solid var(--border-subtle)",
              padding: "1.4rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
              boxShadow: "var(--shadow-modal)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: C.charcoal }}>
                リスト設定
              </h3>
              {!editingCategory.isDefault && (
                <span style={{ fontSize: "0.72rem", color: editingCategory.title.length >= MAX_LIST_NAME_LENGTH ? C.danger : C.charcoalLight }}>
                  {editingCategory.title.length}/{MAX_LIST_NAME_LENGTH}
                </span>
              )}
            </div>

            {editingCategory.isDefault ? (
              <div style={{ fontSize: "0.8rem", color: C.charcoalLight, padding: "0.15rem 0" }}>
                ※ マイタスクの名称・削除は固定ですが、お好みのマークを設定できます。
              </div>
            ) : (
              <input
                type="text"
                value={editingCategory.title}
                maxLength={MAX_LIST_NAME_LENGTH}
                onChange={(e) =>
                  setEditingCategory({ ...editingCategory, title: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUpdateList();
                }}
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "12px",
                  border: "1px solid var(--border-subtle)",
                  background: C.white,
                  fontSize: "0.9rem",
                  color: C.charcoal,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            )}

            {/* 12種類のSVGアイコン選択ピッカー */}
            <ListIconPicker
              selectedIcon={editingCategory.icon || (editingCategory.id === "shopping" ? "cart" : editingCategory.id === "default" ? "sparkle" : "folder")}
              onSelectIcon={(iconId) => setEditingCategory({ ...editingCategory, icon: iconId })}
            />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.3rem" }}>
              {!editingCategory.isDefault && editingCategory.id !== "shopping" ? (
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
              ) : (
                <div />
              )}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  style={{
                    background: "var(--bg-nav-track)",
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
                  data-testid="list-settings-save-btn"
                  onClick={handleUpdateList}
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
              background: "var(--bg-card-solid)",
              borderRadius: "18px",
              border: "1px solid var(--border-subtle)",
              padding: "1.4rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.8rem",
              boxShadow: "var(--shadow-modal)",
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
                  background: "var(--bg-nav-track)",
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

      {/* ─── 完了済みタスク一括削除 確認モーダル ─── */}
      <ConfirmModal
        isOpen={showClearConfirm}
        title="完了したタスクをすべて削除しますか？"
        message="完了したすべてのタスクがこのりすとから完全に削除されます。"
        confirmLabel="削除"
        cancelLabel="キャンセル"
        isDestructive={true}
        onConfirm={executeClearCompleted}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
