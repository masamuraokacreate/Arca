/**
 * src/components/tasks/TaskDetailModal.tsx
 * Arca — タスク詳細編集モーダル (Apple HIG × AetherCore 準拠)
 *
 * 機能:
 * - タイトル・期日・優先度・所属リストの編集
 * - サブタスク一覧の管理（完了トグル、インライン追加、個別削除）
 * - ✦ AIでステップ分解（AetherCore）の実行 & サブタスク展開
 * - タスク完全削除（Firestore & Google Tasks 連動）
 */

import { useState, useEffect, useRef } from "react";
import type { TaskItem, SubTaskItem, TaskListCategory } from "../../types";
import { breakdownTask } from "../../lib/aetherCore";
import { C } from "../../lib/designSystem";

export interface TaskDetailModalProps {
  task: TaskItem;
  categories: TaskListCategory[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTask: TaskItem) => Promise<void>;
  onDelete: (task: TaskItem) => Promise<void>;
}

// ── アイコン ──
const SparklesIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: C.gold }}>
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="M5 3v4" />
    <path d="M19 17v4" />
    <path d="M3 5h4" />
    <path d="M17 19h4" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: C.charcoalLight }}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const SubtaskCheckIcon = ({ completed }: { completed: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth={2}
    style={{
      width: "1rem",
      height: "1rem",
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

export function TaskDetailModal({
  task,
  categories,
  isOpen,
  onClose,
  onSave,
  onDelete,
}: TaskDetailModalProps) {
  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(task.dueDate || "");
  const [priority, setPriority] = useState<"low" | "medium" | "high">(task.priority || "medium");
  const [listId, setListId] = useState(task.listId || "default");
  const [subtasks, setSubtasks] = useState<SubTaskItem[]>(task.subtasks || []);
  const [newSubtaskText, setNewSubtaskText] = useState("");
  const [isBreakingDown, setIsBreakingDown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const newSubtaskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(task.title);
    setDueDate(task.dueDate || "");
    setPriority(task.priority || "medium");
    setListId(task.listId || "default");
    setSubtasks(task.subtasks || []);
  }, [task]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // サブタスクの完了トグル
  const handleToggleSubtask = (subId: string) => {
    setSubtasks((prev) =>
      prev.map((st) => (st.id === subId ? { ...st, completed: !st.completed } : st))
    );
  };

  // サブタスク追加
  const handleAddSubtask = () => {
    const text = newSubtaskText.trim();
    if (!text) return;
    const newSub: SubTaskItem = {
      id: "sub-" + Math.random().toString(36).slice(2, 9),
      title: text,
      completed: false,
    };
    setSubtasks((prev) => [...prev, newSub]);
    setNewSubtaskText("");
  };

  // サブタスク削除
  const handleDeleteSubtask = (subId: string) => {
    setSubtasks((prev) => prev.filter((st) => st.id !== subId));
  };

  // AIステップ分解
  const handleBreakdown = async () => {
    if (!title.trim() || isBreakingDown) return;
    setIsBreakingDown(true);
    try {
      const generated = await breakdownTask(title);
      if (generated && generated.length > 0) {
        const newSubs: SubTaskItem[] = generated.map((t) => ({
          id: "sub-" + Math.random().toString(36).slice(2, 9),
          title: t,
          completed: false,
        }));
        setSubtasks((prev) => [...prev, ...newSubs]);
        showToast(`✦ ${generated.length}件のステップを展開しました`);
      } else {
        showToast("ステップを生成できませんでした");
      }
    } catch {
      showToast("ステップ分解中にエラーが発生しました");
    } finally {
      setIsBreakingDown(false);
    }
  };

  // 保存実行
  const handleSave = async () => {
    if (!title.trim() || isSaving) return;
    setIsSaving(true);
    try {
      const updated: TaskItem = {
        ...task,
        title: title.trim(),
        dueDate: dueDate.trim() || null,
        priority,
        listId,
        subtasks,
        updatedAt: new Date().toISOString(),
      };
      await onSave(updated);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  // 削除実行
  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(task);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
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
        animation: "arca-fade-in 0.2s ease",
      }}
      onClick={onClose}
    >
      <div
        className="arca-card"
        style={{
          width: "100%",
          maxWidth: "520px",
          maxHeight: "90vh",
          overflowY: "auto",
          background: C.white,
          borderRadius: "20px",
          padding: "1.6rem 1.6rem 1.4rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.2rem",
          boxShadow: "0 20px 48px rgba(0, 0, 0, 0.18)",
          boxSizing: "border-box",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── ヘッダー ─── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: C.charcoalLight, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            TASK DETAILS
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "1.1rem",
              color: C.charcoalLight,
              cursor: "pointer",
              padding: "0.2rem 0.4rem",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* ─── タイトル入力 ─── */}
        <div>
          <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 650, color: C.charcoalMid, marginBottom: "0.4rem" }}>
            タスク名
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タスク名を入力…"
            style={{
              width: "100%",
              padding: "0.75rem 0.95rem",
              borderRadius: "14px",
              border: "1px solid rgba(0, 0, 0, 0.06)",
              background: C.ivory,
              fontSize: "0.92rem",
              color: C.charcoal,
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
              boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.02)",
            }}
          />
        </div>

        {/* ─── 設定グリッド（所属リスト・期限・優先度） ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: "0.85rem" }}>
          {/* 所属リスト */}
          <div>
            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 650, color: C.charcoalMid, marginBottom: "0.35rem" }}>
              リスト
            </label>
            <div style={{ position: "relative", width: "100%" }}>
              <select
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                style={{
                  width: "100%",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  appearance: "none",
                  padding: "0.62rem 2.2rem 0.62rem 0.85rem",
                  borderRadius: "14px",
                  border: "none",
                  background: "rgba(0, 0, 0, 0.04)",
                  fontSize: "0.84rem",
                  fontWeight: 500,
                  color: C.charcoal,
                  outline: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
                  transition: "background 0.15s ease",
                }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <div
                style={{
                  position: "absolute",
                  right: "0.8rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ChevronDownIcon />
              </div>
            </div>
          </div>

          {/* 期限日 */}
          <div>
            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 650, color: C.charcoalMid, marginBottom: "0.35rem" }}>
              期日
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{
                width: "100%",
                WebkitAppearance: "none",
                MozAppearance: "none",
                appearance: "none",
                padding: "0.62rem 0.85rem",
                borderRadius: "14px",
                border: "none",
                background: "rgba(0, 0, 0, 0.04)",
                fontSize: "0.82rem",
                fontWeight: 500,
                color: dueDate ? C.charcoal : C.charcoalLight,
                outline: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                boxSizing: "border-box",
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
                transition: "background 0.15s ease",
              }}
            />
          </div>

          {/* 優先度 */}
          <div>
            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 650, color: C.charcoalMid, marginBottom: "0.35rem" }}>
              優先度
            </label>
            <div
              style={{
                display: "flex",
                gap: "2px",
                background: "rgba(0, 0, 0, 0.04)",
                padding: "3px",
                borderRadius: "14px",
                boxSizing: "border-box",
                minHeight: "38px",
                alignItems: "center",
              }}
            >
              {(["low", "medium", "high"] as const).map((p) => {
                const isSelected = priority === p;
                const label = p === "low" ? "低" : p === "medium" ? "中" : "高";
                const color = p === "high" ? C.danger : p === "medium" ? C.goldDark : "#4A709C";
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    style={{
                      flex: 1,
                      border: "none",
                      borderRadius: "11px",
                      padding: "0.38rem 0",
                      fontSize: "0.76rem",
                      fontWeight: isSelected ? 650 : 450,
                      background: isSelected ? C.white : "transparent",
                      color: isSelected ? color : C.charcoalLight,
                      boxShadow: isSelected ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── サブタスク & AIステップ分解セクション ─── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.45rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: C.charcoalMid }}>
              サブタスク ({subtasks.filter((s) => s.completed).length}/{subtasks.length})
            </span>

            {/* ✦ AIステップ分解ボタン */}
            <button
              type="button"
              onClick={handleBreakdown}
              disabled={isBreakingDown || !title.trim()}
              data-testid="detail-ai-breakdown-btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                background: "rgba(197, 160, 89, 0.12)",
                border: "none",
                borderRadius: "8px",
                padding: "0.3rem 0.65rem",
                fontSize: "0.72rem",
                fontWeight: 650,
                color: C.goldDark,
                cursor: isBreakingDown ? "default" : "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {isBreakingDown ? (
                <span>AI分解中…</span>
              ) : (
                <>
                  <SparklesIcon />
                  <span>✦ AIでステップ分解</span>
                </>
              )}
            </button>
          </div>

          {/* サブタスク一覧 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
              background: C.ivory,
              borderRadius: "12px",
              padding: "0.6rem 0.75rem",
              maxHeight: "180px",
              overflowY: "auto",
            }}
          >
            {subtasks.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.76rem", color: C.charcoalLight, textAlign: "center", padding: "0.6rem 0" }}>
                サブタスクはありません
              </p>
            ) : (
              subtasks.map((st) => (
                <div
                  key={st.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.3rem 0.4rem",
                    borderRadius: "6px",
                    background: st.completed ? "transparent" : "rgba(255, 255, 255, 0.6)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleSubtask(st.id)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", lineHeight: 0 }}
                  >
                    <SubtaskCheckIcon completed={st.completed} />
                  </button>
                  <span
                    onClick={() => handleToggleSubtask(st.id)}
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
                  <button
                    type="button"
                    onClick={() => handleDeleteSubtask(st.id)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "0.15rem",
                      cursor: "pointer",
                      color: C.charcoalLight,
                      lineHeight: 0,
                    }}
                    title="削除"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))
            )}

            {/* サブタスク追加入力 */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.2rem" }}>
              <span style={{ fontSize: "0.85rem", color: C.charcoalLight }}>+</span>
              <input
                ref={newSubtaskInputRef}
                type="text"
                value={newSubtaskText}
                onChange={(e) => setNewSubtaskText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
                placeholder="サブタスクを追加…（Enterで確定）"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: "0.78rem",
                  color: C.charcoal,
                }}
              />
              {newSubtaskText.trim() && (
                <button
                  type="button"
                  onClick={handleAddSubtask}
                  style={{
                    background: C.gold,
                    color: "#FDFCFA",
                    border: "none",
                    borderRadius: "6px",
                    padding: "0.2rem 0.5rem",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  追加
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ─── フッター（削除ボタン & 保存/キャンセル） ─── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.4rem" }}>
          {/* 完全削除ボタン */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            data-testid="detail-task-delete-btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              background: "transparent",
              border: "none",
              color: C.danger,
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer",
              padding: "0.4rem 0.2rem",
            }}
          >
            <TrashIcon />
            <span>タスクを削除</span>
          </button>

          {/* 右側アクション */}
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "rgba(0, 0, 0, 0.05)",
                border: "none",
                borderRadius: "10px",
                padding: "0.55rem 1rem",
                fontSize: "0.82rem",
                fontWeight: 600,
                color: C.charcoalMid,
                cursor: "pointer",
              }}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !title.trim()}
              data-testid="detail-task-save-btn"
              style={{
                background: C.gold,
                border: "none",
                borderRadius: "10px",
                padding: "0.55rem 1.3rem",
                fontSize: "0.82rem",
                fontWeight: 650,
                color: "#FDFCFA",
                cursor: isSaving || !title.trim() ? "default" : "pointer",
                opacity: isSaving || !title.trim() ? 0.6 : 1,
                boxShadow: "0 2px 8px rgba(197, 160, 89, 0.25)",
              }}
            >
              保存する
            </button>
          </div>
        </div>

        {/* 内部トースト */}
        {toastMsg && (
          <div
            style={{
              position: "absolute",
              bottom: "1rem",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(36, 36, 38, 0.95)",
              color: "#FDFCFA",
              padding: "0.5rem 1rem",
              borderRadius: "9999px",
              fontSize: "0.75rem",
              fontWeight: 550,
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            {toastMsg}
          </div>
        )}
      </div>
    </div>
  );
}
