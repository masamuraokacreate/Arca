/**
 * src/components/Lists.tsx
 * Arca — Lists / 買い物リスト (Apple HIG × Arca 準拠)
 *
 * 設計原則 (Core/Rules.md):
 *  - 道具としての静けさ、AIは主役にならず裏方で支える
 *  - 余計なお節介UIは排し、静寂で洗練されたミニマルデザイン
 *  - 削除確認ダイアログ & 元に戻す（Undo）機能による安心感
 *  - アイテムのインライン編集（鉛筆アイコン / Enter保存 / Escキャンセル）
 *  - スーパー買い回り順路ソート（Smart Route Sorting）
 *  - カテゴリグループ化表示（[ すべて | グループ表示 ] ピル型セグメント）
 *  - 未分類アイテムの一括自動整理（✦ 未分類を自動整理）
 *  - Google同期時の厳密な重複排除・冪等性確保
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
import { suggestCategory, categorizeItems } from "../lib/aetherCore";
import type { ListItem, SyncStatus, SuggestionState } from "../types";
import { C } from "../lib/designSystem";
import { useUndoToast } from "../hooks/useUndoToast";
import { UndoToast } from "./common/UndoToast";

// ---------- 定数 ----------
const TASKLIST_NAME = "買い物リスト";

// ---------- スーパー買い回り順路定義 ----------
export interface StoreCategoryGroupInfo {
  order: number;
  groupName: string;
}

export const STORE_ROUTE_GROUPS: { [key: string]: StoreCategoryGroupInfo } = {
  // 1. Produce (入口付近の野菜・果物)
  "野菜": { order: 1, groupName: "野菜・果物" },
  "果物": { order: 1, groupName: "野菜・果物" },
  "フルーツ": { order: 1, groupName: "野菜・果物" },
  "生鮮野菜": { order: 1, groupName: "野菜・果物" },
  "野菜・果物": { order: 1, groupName: "野菜・果物" },

  // 2. Meat / Seafood (奥の生鮮・肉・魚)
  "精肉": { order: 2, groupName: "肉・魚" },
  "鮮魚": { order: 2, groupName: "肉・魚" },
  "肉": { order: 2, groupName: "肉・魚" },
  "魚": { order: 2, groupName: "肉・魚" },
  "肉・魚": { order: 2, groupName: "肉・魚" },

  // 3. Dairy / Pantry / Drinks (中央通路の乳製品・調味料・一般食品・飲料)
  "乳製品": { order: 3, groupName: "乳製品・卵・調味料" },
  "卵": { order: 3, groupName: "乳製品・卵・調味料" },
  "チーズ": { order: 3, groupName: "乳製品・卵・調味料" },
  "調味料": { order: 3, groupName: "乳製品・卵・調味料" },
  "一般食品": { order: 3, groupName: "乳製品・卵・調味料" },
  "食品": { order: 3, groupName: "乳製品・卵・調味料" },
  "乳製品・卵・調味料": { order: 3, groupName: "乳製品・卵・調味料" },
  "飲料": { order: 3, groupName: "乳製品・卵・調味料" },
  "飲料・お酒": { order: 3, groupName: "乳製品・卵・調味料" },
  "お酒": { order: 3, groupName: "乳製品・卵・調味料" },
  "乾物": { order: 3, groupName: "乳製品・卵・調味料" },

  // 4. Deli / Bakery (惣菜・パン・デリカ)
  "お惣菜": { order: 4, groupName: "お惣菜・パン" },
  "惣菜": { order: 4, groupName: "お惣菜・パン" },
  "パン": { order: 4, groupName: "お惣菜・パン" },
  "デリカ": { order: 4, groupName: "お惣菜・パン" },
  "ベーカリー": { order: 4, groupName: "お惣菜・パン" },
  "お惣菜・パン": { order: 4, groupName: "お惣菜・パン" },

  // 5. Frozen (溶けないようレジ直前の冷凍食品・アイス)
  "冷凍食品": { order: 5, groupName: "冷凍食品" },
  "冷凍": { order: 5, groupName: "冷凍食品" },
  "アイス": { order: 5, groupName: "冷凍食品" },

  // 6. Household / Others (日用品・その他)
  "日用品": { order: 6, groupName: "日用品・その他" },
  "雑貨": { order: 6, groupName: "日用品・その他" },
  "その他": { order: 6, groupName: "日用品・その他" },
  "日用品・その他": { order: 6, groupName: "日用品・その他" },
};

export function getCategoryOrder(category?: string | null): StoreCategoryGroupInfo {
  if (!category) return { order: 99, groupName: "日用品・その他" };
  const cat = category.trim();
  if (STORE_ROUTE_GROUPS[cat]) return STORE_ROUTE_GROUPS[cat];

  // 部分一致検索
  for (const [key, val] of Object.entries(STORE_ROUTE_GROUPS)) {
    if (cat.includes(key) || key.includes(cat)) {
      return val;
    }
  }
  return { order: 99, groupName: "日用品・その他" };
}

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

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" style={{ width: "0.85rem", height: "0.85rem" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
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

function RouteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" style={{ width: "0.85rem", height: "0.85rem" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}

function SparklesSmallIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: C.gold }}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
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

  // 表示モード & ソート状態
  const [viewMode, setViewMode] = useState<"all" | "grouped">("all");
  const [isRouteSorted, setIsRouteSorted] = useState(false);

  // 削除確認モーダル状態
  const [confirmClearModal, setConfirmClearModal] = useState(false);

  // Aether 機能ステート
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestionState>({ phase: "idle" });
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionTokenRef = useRef(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const gTaskListIdRef = useRef<string | null>(null);

  const { isReady, isSignedIn, accessToken, signIn, signOut } = useGoogleAuth();
  // UndoToast で単体・配列双方を扱えるよう設定
  const { toast, showUndoToast, dismissToast, triggerUndo } = useUndoToast<ListItem | ListItem[]>();

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

  // Google Tasks 初期同期（厳密な重複排除・冪等性確保）
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

        // 冪等性確保: 最新のFirestoreデータを直接取得して照合
        const currentSnap = await getDocs(collection(db, "lists"));
        const existingDocs = currentSnap.docs.map((d) => ({
          id: d.id,
          data: d.data() as Omit<ListItem, "id">,
        }));

        for (const gTask of gTasks) {
          if (isCancelled) return;

          // 1) googleTaskId が完全一致するアイテムが存在するか確認
          const matchById = existingDocs.find(
            (item) => item.data.googleTaskId === gTask.id
          );

          if (matchById) {
            // ステータスに差分があれば更新のみ行う
            const isCompleted = gTask.status === "completed";
            if (matchById.data.completed !== isCompleted) {
              await updateDoc(doc(db, "lists", matchById.id), {
                completed: isCompleted,
              });
            }
            continue;
          }

          // 2) 同一テキスト（かつ未紐付け）のアイテムが既に存在するか確認
          const matchByText = existingDocs.find(
            (item) =>
              !item.data.googleTaskId &&
              item.data.text.trim() === gTask.title.trim()
          );

          if (matchByText) {
            // googleTaskId を紐付けて完了状態を同期
            await updateDoc(doc(db, "lists", matchByText.id), {
              googleTaskId: gTask.id,
              completed: gTask.status === "completed",
            });
            continue;
          }

          // 3) どちらにも該当しない場合のみ新規追加
          await addDoc(collection(db, "lists"), {
            text: gTask.title,
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

  // 未完了 / 完了済み アイテムの仕分け
  const rawPending = items.filter((i) => !i.completed);
  const completed = items.filter((i) => i.completed);

  // 未分類アイテムのリスト
  const uncategorizedItems = useMemo(
    () => rawPending.filter((i) => !i.category || !i.category.trim()),
    [rawPending]
  );

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

      const docRef = await addDoc(collection(db, "lists"), {
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

      // カテゴリが未指定の場合はバックグラウンドで自動推論して設定
      if (!category) {
        Promise.resolve(suggestCategory(text))
          .then((inferredCat) => {
            if (inferredCat) {
              updateDoc(doc(db, "lists", docRef.id), { category: inferredCat }).catch(() => {});
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error("Failed to add item:", err);
    } finally {
      setIsAdding(false);
    }
  };

  // 未分類アイテムの一括自動整理
  const handleAutoCategorize = async () => {
    if (uncategorizedItems.length === 0 || isCategorizing) return;
    setIsCategorizing(true);

    try {
      const itemNames = uncategorizedItems.map((i) => i.text);
      const catMap = await categorizeItems(itemNames);

      let updatedCount = 0;
      const promises: Promise<unknown>[] = [];

      for (const item of uncategorizedItems) {
        const inferred = catMap[item.text];
        if (inferred) {
          updatedCount++;
          promises.push(
            updateDoc(doc(db, "lists", item.id), { category: inferred })
          );
        }
      }

      await Promise.all(promises);
    } catch (err) {
      console.error("Auto categorize failed:", err);
    } finally {
      setIsCategorizing(false);
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

  // タイトル更新（インライン編集）
  const handleUpdateTitle = useCallback(async (id: string, newText: string) => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    try {
      await updateDoc(doc(db, "lists", id), { text: trimmed });
    } catch (err) {
      console.error("Failed to update item title:", err);
    }
  }, []);

  // 個別削除（Undo対応）
  const handleDelete = async (item: ListItem) => {
    try {
      await deleteDoc(doc(db, "lists", item.id));

      showUndoToast({
        message: `「${item.text}」を削除しました`,
        item,
        onUndo: async (restored) => {
          const restoredItem = Array.isArray(restored) ? restored[0] : restored;
          if (!restoredItem) return;
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

  // 完了済みアイテムの一括削除実行（Undo対応）
  const handleConfirmClearCompleted = async () => {
    if (completed.length === 0) return;
    const toDelete = [...completed];
    setConfirmClearModal(false);

    try {
      await Promise.all(toDelete.map((item) => deleteDoc(doc(db, "lists", item.id))));

      showUndoToast({
        message: `${toDelete.length}件の完了アイテムを削除しました`,
        item: toDelete,
        onUndo: async (restored) => {
          const itemsToRestore = Array.isArray(restored) ? restored : [restored];
          await Promise.all(
            itemsToRestore.map((item) =>
              addDoc(collection(db, "lists"), {
                text: item.text,
                completed: true,
                category: item.category || null,
                googleTaskId: item.googleTaskId || null,
                createdAt: serverTimestamp(),
              })
            )
          );
        },
      });
    } catch (err) {
      console.error("Failed to clear completed items:", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAdd();
  };

  // スーパー順路ソート適用
  const pending = useMemo(() => {
    if (!isRouteSorted && viewMode === "all") return rawPending;
    return [...rawPending].sort((a, b) => {
      const orderA = getCategoryOrder(a.category).order;
      const orderB = getCategoryOrder(b.category).order;
      if (orderA !== orderB) return orderA - orderB;
      return (a.text || "").localeCompare(b.text || "");
    });
  }, [rawPending, isRouteSorted, viewMode]);

  // グループ化データ作成
  const groupedPending = useMemo(() => {
    const map = new Map<string, { order: number; groupName: string; items: ListItem[] }>();

    for (const item of rawPending) {
      const { order, groupName } = getCategoryOrder(item.category);
      if (!map.has(groupName)) {
        map.set(groupName, { order, groupName, items: [] });
      }
      map.get(groupName)!.items.push(item);
    }

    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [rawPending]);

  return (
    <div className="w-full max-w-xl mx-auto" style={{ padding: "2.8rem 1.5rem 6rem", boxSizing: "border-box" }}>
      
      {/* ─── ヘッダー（統一された静かなデザイン） ─── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem", padding: "0 0.25rem" }}>
        <div>
          <p style={{ fontSize: "0.68rem", fontWeight: 650, color: C.charcoalLight, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>
            LISTS
          </p>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 750, color: C.charcoal, margin: "0.15rem 0 0", letterSpacing: "-0.03em" }}>
            買い物リスト
          </h1>
          <p style={{ fontSize: "0.78rem", color: C.charcoalLight, margin: "0.3rem 0 0", letterSpacing: "0.01em" }}>
            {rawPending.length}件のアイテム
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
      <div style={{ marginBottom: "1.4rem" }}>
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

      {/* ─── 表示コントロールツールバー（グループ化 & 順路ソート & 未分類自動整理） ─── */}
      {rawPending.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginBottom: "1.2rem",
            padding: "0 0.25rem",
          }}
        >
          {/* [ すべて | グループ表示 ] ピル型セグメント */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "rgba(0, 0, 0, 0.04)",
              padding: "2px",
              borderRadius: "9999px",
              gap: "2px",
            }}
          >
            <button
              onClick={() => setViewMode("all")}
              style={{
                border: "none",
                borderRadius: "9999px",
                padding: "0.28rem 0.8rem",
                fontSize: "0.74rem",
                fontWeight: viewMode === "all" ? 600 : 450,
                color: viewMode === "all" ? C.charcoal : C.charcoalLight,
                background: viewMode === "all" ? C.white : "transparent",
                boxShadow: viewMode === "all" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              すべて
            </button>
            <button
              onClick={() => setViewMode("grouped")}
              style={{
                border: "none",
                borderRadius: "9999px",
                padding: "0.28rem 0.8rem",
                fontSize: "0.74rem",
                fontWeight: viewMode === "grouped" ? 600 : 450,
                color: viewMode === "grouped" ? C.charcoal : C.charcoalLight,
                background: viewMode === "grouped" ? C.white : "transparent",
                boxShadow: viewMode === "grouped" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              グループ表示
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            {/* 未分類アイテムの一括自動整理ボタン */}
            {uncategorizedItems.length > 0 && (
              <button
                onClick={handleAutoCategorize}
                disabled={isCategorizing}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  border: "none",
                  background: C.goldFaint2,
                  color: C.goldDark,
                  borderRadius: "9999px",
                  padding: "0.28rem 0.75rem",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  cursor: isCategorizing ? "default" : "pointer",
                  transition: "all 0.15s ease",
                  boxShadow: "0 1px 3px rgba(197, 160, 89, 0.12)",
                }}
                title="未分類のアイテムにAIでカテゴリを一括設定"
              >
                {isCategorizing ? (
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
                  <SparklesSmallIcon />
                )}
                <span>✦ 未分類を自動整理 ({uncategorizedItems.length})</span>
              </button>
            )}

            {/* スーパー順路順ソートトグルボタン（すべて表示時のみ切り替え可能） */}
            {viewMode === "all" && (
              <button
                onClick={() => setIsRouteSorted((v) => !v)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  border: "none",
                  background: isRouteSorted ? C.goldFaint2 : "transparent",
                  color: isRouteSorted ? C.goldDark : C.charcoalLight,
                  borderRadius: "9999px",
                  padding: "0.28rem 0.75rem",
                  fontSize: "0.72rem",
                  fontWeight: isRouteSorted ? 600 : 450,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                title="スーパーの売り場順路（野菜→肉魚→調味料→冷凍→日用品）で整列"
              >
                <RouteIcon />
                <span>順路順で並び替え</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── リスト一覧 ─── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.8rem" }}>
        
        {/* 未完了アイテム（通常表示 または グループ表示） */}
        {viewMode === "all" ? (
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
                    onUpdateTitle={handleUpdateTitle}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            )}
          </div>
        ) : (
          /* グループ表示モード */
          <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
            {groupedPending.length === 0 ? (
              <div className="arca-card" style={{ padding: "2rem 1.25rem", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight }}>
                  リストは空です
                </p>
              </div>
            ) : (
              groupedPending.map((group) => (
                <div key={group.groupName}>
                  {/* グループセクションヘッダー */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      marginBottom: "0.45rem",
                      padding: "0 0.5rem",
                    }}
                  >
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: C.goldDark, letterSpacing: "0.05em" }}>
                      ✦ {group.groupName}
                    </span>
                    <span style={{ fontSize: "0.68rem", color: C.charcoalLight, fontWeight: 500 }}>
                      ({group.items.length})
                    </span>
                  </div>

                  {/* グループカード */}
                  <div className="arca-card" style={{ padding: "0.6rem 1.25rem" }}>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                      {group.items.map((item) => (
                        <ListItemRow
                          key={item.id}
                          item={item}
                          onToggle={handleToggle}
                          onUpdateTitle={handleUpdateTitle}
                          onDelete={handleDelete}
                        />
                      ))}
                    </ul>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 完了済みアイテム */}
        {completed.length > 0 && (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 0.5rem",
                marginBottom: "0.6rem",
              }}
            >
              <span style={{ fontSize: "0.72rem", color: C.charcoalLight, letterSpacing: "0.06em" }}>
                完了済み ({completed.length})
              </span>
              <button
                onClick={() => setConfirmClearModal(true)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: "0.72rem",
                  color: C.charcoalLight,
                  cursor: "pointer",
                  fontWeight: 500,
                  transition: "color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = C.danger;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = C.charcoalLight;
                }}
                title="完了したアイテムをすべて削除"
              >
                完了済みを消去
              </button>
            </div>

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
                    onUpdateTitle={handleUpdateTitle}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            </div>
          </div>
        )}

      </div>

      {/* ─── 削除確認モーダル（Apple HIG すりガラススタイル） ─── */}
      {confirmClearModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0, 0, 0, 0.35)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            animation: "arca-backdrop-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onClick={() => setConfirmClearModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "340px",
              background: "rgba(253, 252, 250, 0.98)",
              borderRadius: "24px",
              padding: "1.5rem 1.4rem 1.2rem",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.15), 0 4px 16px rgba(0, 0, 0, 0.06)",
              textAlign: "center",
              animation: "arca-modal-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: C.charcoal, margin: "0 0 0.5rem" }}>
              完了済みアイテムの削除
            </h3>
            <p style={{ fontSize: "0.82rem", color: C.charcoalMid, lineHeight: 1.45, margin: "0 0 1.4rem" }}>
              完了した {completed.length} 件のアイテムをリストから削除しますか？
            </p>

            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button
                onClick={() => setConfirmClearModal(false)}
                style={{
                  flex: 1,
                  background: "rgba(0, 0, 0, 0.05)",
                  border: "none",
                  borderRadius: "12px",
                  padding: "0.65rem 0",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: C.charcoal,
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirmClearCompleted}
                style={{
                  flex: 1,
                  background: C.danger,
                  border: "none",
                  borderRadius: "12px",
                  padding: "0.65rem 0",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "#FFFFFF",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(224, 86, 74, 0.25)",
                  transition: "opacity 0.15s ease",
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

// ---------- アイテム行（インライン編集付き） ----------
function ListItemRow({
  item,
  onToggle,
  onUpdateTitle,
  onDelete,
}: {
  item: ListItem;
  onToggle: (item: ListItem) => void;
  onUpdateTitle: (id: string, newText: string) => void;
  onDelete: (item: ListItem) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.text);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditTitle(item.text);
  }, [item.text]);

  const startEdit = () => {
    setIsEditing(true);
    setEditTitle(item.text);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const saveEdit = () => {
    if (editTitle.trim() && editTitle.trim() !== item.text) {
      onUpdateTitle(item.id, editTitle.trim());
    } else {
      setEditTitle(item.text);
    }
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setEditTitle(item.text);
    setIsEditing(false);
  };

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
        minHeight: "48px",
        boxSizing: "border-box",
      }}
    >
      {/* チェックボックスボタン */}
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

      {/* テキスト表示 または インライン編集入力 */}
      {isEditing ? (
        <input
          ref={editInputRef}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveEdit();
            if (e.key === "Escape") cancelEdit();
          }}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            borderBottom: `1px solid ${C.gold}`,
            outline: "none",
            fontSize: "0.875rem",
            color: C.charcoal,
            padding: "0.15rem 0",
            letterSpacing: "0.01em",
          }}
        />
      ) : (
        <span
          onClick={() => onToggle(item)}
          style={{
            flex: 1,
            fontSize: "0.875rem",
            color: item.completed ? C.charcoalLight : C.charcoal,
            textDecoration: item.completed ? "line-through" : "none",
            fontWeight: 400,
            letterSpacing: "0.01em",
            cursor: "pointer",
            lineHeight: 1.35,
          }}
        >
          {item.text}
        </span>
      )}

      {/* カテゴリバッジ */}
      {item.category && !isEditing && (
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

      {/* アクションボタン（編集・削除） */}
      {!isEditing && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.2rem",
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.15s ease",
            flexShrink: 0,
          }}
        >
          {/* 編集ボタン */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              startEdit();
            }}
            style={{
              background: "none",
              border: "none",
              padding: "0.2rem",
              cursor: "pointer",
              color: C.charcoalLight,
              lineHeight: 0,
              borderRadius: "4px",
            }}
            title="アイテム名を編集"
            data-testid="item-edit-btn"
          >
            <PencilIcon />
          </button>

          {/* 削除ボタン */}
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
              borderRadius: "4px",
            }}
            title="削除"
            data-testid="item-delete-btn"
          >
            <TrashIcon />
          </button>
        </div>
      )}
    </li>
  );
}
