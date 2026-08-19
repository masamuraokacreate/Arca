/**
 * src/components/Lists.tsx
 * Arca — Lists / 買い物リスト (Apple HIG × Arca 準拠)
 */

import { useState, useEffect, useRef } from "react";
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
  getTasks,
  addTask as gAddTask,
  updateTaskStatus,
  type GTaskList,
} from "../lib/googleTasks";
import { suggestCategory } from "../lib/aetherCore";
import type { ListItem, SyncStatus, SuggestionState } from "../types";
import { C } from "../lib/designSystem";
import { useUndoToast } from "../hooks/useUndoToast";
import { UndoToast } from "./common/UndoToast";

// ---------- 定数 ----------
const TASKLIST_NAME = "買い物リスト";

// ---------- アイコン ----------
function CheckIcon({ completed }: { completed: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
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

// ---------- Aether Core カテゴリ提案バッジ ----------
function CategorySuggestion({
  state,
  onAccept,
}: {
  state: SuggestionState;
  onAccept: (category: string) => void;
}) {
  if (state.phase === "thinking") {
    return (
      <div style={{ height: "1.75rem", display: "flex", alignItems: "center", paddingLeft: "0.25rem", gap: "4px" }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              display: "inline-block",
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              backgroundColor: C.gold,
              opacity: 0.5,
              animation: `aether-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    );
  }

  if (state.phase === "ready") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", height: "1.75rem", animation: "aether-fadein 0.25s ease" }}>
        <span style={{ fontSize: "0.68rem", color: C.gold, letterSpacing: "0.04em", fontWeight: 600 }}>
          ✦ Aether
        </span>
        <button
          onClick={() => onAccept(state.category)}
          title="クリックしてカテゴリを採用"
          style={{
            fontSize: "0.72rem",
            color: C.gold,
            background: C.goldFaint2,
            border: "none",
            borderRadius: "9999px",
            padding: "0.2rem 0.65rem",
            cursor: "pointer",
            letterSpacing: "0.02em",
            fontWeight: 500,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = C.goldFaint3;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = C.goldFaint2;
          }}
        >
          {state.category}
        </button>
        <span style={{ fontSize: "0.68rem", color: C.charcoalLight }}>
          はいかがですか？
        </span>
      </div>
    );
  }

  if (state.phase === "accepted") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", height: "1.75rem", animation: "aether-fadein 0.2s ease" }}>
        <span
          style={{
            fontSize: "0.72rem",
            color: C.sage,
            background: C.sageFaint,
            borderRadius: "9999px",
            padding: "0.2rem 0.65rem",
            letterSpacing: "0.02em",
            fontWeight: 500,
          }}
        >
          ✓ {state.category}
        </span>
      </div>
    );
  }

  return <div style={{ height: "1.75rem" }} />;
}

// ---------- メインコンポーネント ----------
export default function Lists() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  const [suggestion, setSuggestion] = useState<SuggestionState>({ phase: "idle" });
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionTokenRef = useRef(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const gTaskListIdRef = useRef<string | null>(null);

  const { isReady, isSignedIn, accessToken, signIn, signOut } = useGoogleAuth();
  const { toast, showUndoToast, dismissToast, triggerUndo } = useUndoToast<ListItem>();

  // Firestore リアルタイム同期
  useEffect(() => {
    const q = query(collection(db, "lists"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) => {
      setItems(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ListItem, "id">),
        }))
      );
    });
  }, []);

  // Google Tasks 初期同期
  useEffect(() => {
    if (!isSignedIn || !accessToken) return;
    let isCancelled = false;

    async function initGoogleTasks() {
      try {
        setSyncStatus("syncing");
        const lists = await getTaskLists(accessToken!);
        let target = lists.find((l: GTaskList) => l.title === TASKLIST_NAME);
        if (!target) {
          target = lists[0];
        }
        if (!target) {
          setSyncStatus("error");
          return;
        }

        gTaskListIdRef.current = target.id;
        const gTasks = await getTasks(accessToken!, target.id);
        if (isCancelled) return;

        for (const gTask of gTasks) {
          const exists = items.some((item) => item.googleTaskId === gTask.id);
          if (!exists) {
            await addDoc(collection(db, "lists"), {
              text: gTask.title,
              completed: gTask.status === "completed",
              googleTaskId: gTask.id,
              createdAt: serverTimestamp(),
            });
          }
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

  // 入力時のカテゴリ提案
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (!val.trim()) {
      setSuggestion({ phase: "idle" });
      return;
    }

    setSuggestion({ phase: "thinking" });
    const currentToken = ++suggestionTokenRef.current;

    debounceTimerRef.current = setTimeout(async () => {
      const category = await suggestCategory(val);
      if (suggestionTokenRef.current === currentToken) {
        if (category) {
          setSuggestion({ phase: "ready", category });
        } else {
          setSuggestion({ phase: "idle" });
        }
      }
    }, 600);
  };

  const handleAcceptSuggestion = (category: string) => {
    setSuggestion({ phase: "accepted", category });
    inputRef.current?.focus();
  };

  // アイテム追加
  const handleAdd = async () => {
    const text = inputValue.trim();
    if (!text || isAdding) return;

    setIsAdding(true);
    const category =
      suggestion.phase === "accepted"
        ? suggestion.category
        : suggestion.phase === "ready"
        ? suggestion.category
        : undefined;

    try {
      let googleTaskId: string | undefined;
      if (isSignedIn && accessToken && gTaskListIdRef.current) {
        try {
          const gTaskId = await gAddTask(accessToken, gTaskListIdRef.current, text);
          googleTaskId = gTaskId;
        } catch (gErr) {
          console.error("Failed to add to Google Tasks:", gErr);
        }
      }

      await addDoc(collection(db, "lists"), {
        text,
        completed: false,
        category: category || null,
        googleTaskId: googleTaskId || null,
        createdAt: serverTimestamp(),
      });

      setInputValue("");
      setSuggestion({ phase: "idle" });
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      });
    } catch (err) {
      console.error("Failed to add item:", err);
    } finally {
      setIsAdding(false);
    }
  };

  // 完了トグル
  const handleToggle = async (item: ListItem) => {
    const next = !item.completed;
    try {
      await updateDoc(doc(db, "lists", item.id), { completed: next });
      if (isSignedIn && accessToken && gTaskListIdRef.current && item.googleTaskId) {
        await updateTaskStatus(
          accessToken,
          gTaskListIdRef.current,
          item.googleTaskId,
          next
        );
      }
    } catch (err) {
      console.error("Failed to toggle item:", err);
    }
  };

  // 削除（Undo対応）
  const handleDelete = async (item: ListItem) => {
    try {
      await deleteDoc(doc(db, "lists", item.id));

      showUndoToast({
        message: `「${item.text}」を削除しました`,
        item,
        onUndo: async (restoredItem) => {
          await addDoc(collection(db, "lists"), {
            text: restoredItem.text,
            completed: restoredItem.completed,
            category: restoredItem.category || null,
            googleTaskId: restoredItem.googleTaskId || null,
            createdAt: serverTimestamp(),
          });
        },
      });
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAdd();
  };

  const pending = items.filter((i) => !i.completed);
  const completed = items.filter((i) => i.completed);

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
            Arca / Lists
          </p>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 750, color: C.charcoal, margin: 0, letterSpacing: "-0.03em" }}>
            買い物リスト
          </h1>
          <p style={{ fontSize: "0.78rem", color: C.charcoalLight, margin: "0.3rem 0 0", letterSpacing: "0.01em" }}>
            {pending.length}件のアイテム
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

      {/* ─── 入力フォーム ─── */}
      <div style={{ marginBottom: "2rem" }}>
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
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="アイテムを追加…"
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
          <button
            onClick={handleAdd}
            disabled={!inputValue.trim() || isAdding}
            style={{
              background: inputValue.trim() ? C.gold : "rgba(0, 0, 0, 0.06)",
              color: inputValue.trim() ? "#FDFCFA" : C.charcoalXLight,
              border: "none",
              borderRadius: "10px",
              padding: "0.45rem 0.95rem",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: inputValue.trim() ? "pointer" : "default",
              transition: "all 0.15s ease",
              flexShrink: 0,
            }}
          >
            追加
          </button>
        </div>

        {/* Aether Core 提案行 */}
        <div style={{ padding: "0.35rem 0.6rem 0" }}>
          <CategorySuggestion state={suggestion} onAccept={handleAcceptSuggestion} />
        </div>
      </div>

      {/* ─── リスト一覧 ─── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.8rem" }}>
        
        {/* 未完了アイテム */}
        <div
          className="arca-card"
          style={{
            padding: "0.8rem 1.25rem",
          }}
        >
          {pending.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight, textAlign: "center", padding: "2rem 0" }}>
              リストは空です
            </p>
          ) : (
            <ul ref={listRef} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
              {pending.map((item) => (
                <ListItemRow
                  key={item.id}
                  item={item}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}
        </div>

        {/* 完了済みアイテム */}
        {completed.length > 0 && (
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
                {completed.map((item) => (
                  <ListItemRow
                    key={item.id}
                    item={item}
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

// ---------- アイテム行 ----------
function ListItemRow({
  item,
  onToggle,
  onDelete,
}: {
  item: ListItem;
  onToggle: (item: ListItem) => void;
  onDelete: (item: ListItem) => void;
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
        opacity: item.completed ? 0.45 : 1,
        transition: "opacity 0.2s ease",
        cursor: "pointer",
      }}
      onClick={() => onToggle(item)}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle(item);
        }}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", lineHeight: 0 }}
        title={item.completed ? "未完了に戻す" : "完了にする"}
      >
        <CheckIcon completed={item.completed} />
      </button>

      <span
        style={{
          flex: 1,
          fontSize: "0.875rem",
          color: item.completed ? C.charcoalLight : C.charcoal,
          textDecoration: item.completed ? "line-through" : "none",
          fontWeight: 400,
          letterSpacing: "0.01em",
        }}
      >
        {item.text}
      </span>

      {item.category && (
        <span
          title={`カテゴリ: ${item.category}`}
          style={{
            fontSize: "0.68rem",
            color: C.charcoalLight,
            background: "rgba(0, 0, 0, 0.04)",
            padding: "0.15rem 0.55rem",
            borderRadius: "6px",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {item.category}
        </span>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(item);
        }}
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
