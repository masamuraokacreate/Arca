import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
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

// ---------- 定数 ----------
const TASKLIST_NAME = "買い物リスト";
const COLOR_SAGE    = "#52796F";

// ---------- 型 ----------
interface ListItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: Timestamp | null;
  googleTaskId?: string;
  category?: string;           // Aether Core が推論・ユーザーが採用したカテゴリ
}

type SyncStatus = "idle" | "syncing" | "done" | "error";

// カテゴリ提案の状態
type SuggestionState =
  | { phase: "idle" }
  | { phase: "thinking" }
  | { phase: "ready"; category: string }
  | { phase: "accepted"; category: string };

// ---------- アイコン ----------
function CheckIcon({ completed }: { completed: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.5}
      className="w-5 h-5 flex-shrink-0 transition-all duration-300"
      style={{ stroke: completed ? "var(--color-accent)" : "#C8C8C0" }}
    >
      {completed ? (
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      ) : (
        <circle cx="12" cy="12" r="9" />
      )}
    </svg>
  );
}

// ---------- Google 同期バッジ ----------
function SyncBadge({
  isReady, isSignedIn, syncStatus, onSignIn, onSignOut,
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
        className="flex items-center gap-1.5 text-xs tracking-wider transition-opacity duration-200 hover:opacity-70 active:opacity-50"
        style={{ color: "#B0AFA8" }}
        title="Googleでログインして同期を有効にする"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" fill="#B0AFA8" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#B0AFA8" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" fill="#B0AFA8" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#B0AFA8" />
        </svg>
        Google同期
      </button>
    );
  }

  const statusLabel =
    syncStatus === "syncing" ? "同期中…"   :
    syncStatus === "done"    ? "同期完了"   :
    syncStatus === "error"   ? "同期エラー" :
    "Google同期有効";

  const statusColor =
    syncStatus === "syncing" ? "var(--color-accent)" :
    syncStatus === "done"    ? COLOR_SAGE             :
    syncStatus === "error"   ? "#E07070"              :
    "var(--color-accent)";

  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className="text-xs tracking-wider transition-colors duration-500"
        style={{ color: statusColor }}
      >
        {statusLabel}
      </span>
      <button
        onClick={onSignOut}
        className="text-xs tracking-wider transition-opacity duration-200 hover:opacity-60"
        style={{ color: "#C0BEB8" }}
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
  // thinking 状態の点滅ドット（存在感を主張しすぎない微細アニメ）
  if (state.phase === "thinking") {
    return (
      <div
        style={{
          height: "1.75rem",
          display: "flex",
          alignItems: "center",
          paddingLeft: "0.25rem",
          gap: "4px",
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              display: "inline-block",
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              backgroundColor: "var(--color-accent)",
              opacity: 0.4,
              animation: `aether-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    );
  }

  if (state.phase === "ready") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          height: "1.75rem",
          animation: "aether-fadein 0.3s ease",
        }}
      >
        <span
          style={{
            fontSize: "0.65rem",
            color: "#B8B0A0",
            letterSpacing: "0.08em",
          }}
        >
          ✦ Aether
        </span>
        <button
          onClick={() => onAccept(state.category)}
          title="クリックしてカテゴリを採用"
          style={{
            fontSize: "0.72rem",
            color: "var(--color-accent)",
            background: "rgba(197, 160, 89, 0.08)",
            border: "none",
            borderRadius: "20px",
            padding: "0.2rem 0.65rem",
            cursor: "pointer",
            letterSpacing: "0.05em",
            boxShadow: "0 1px 6px rgba(197,160,89,0.12)",
            transition: "background 0.2s, box-shadow 0.2s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(197, 160, 89, 0.16)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 2px 10px rgba(197,160,89,0.22)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(197, 160, 89, 0.08)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 1px 6px rgba(197,160,89,0.12)";
          }}
        >
          {state.category}
        </button>
        <span style={{ fontSize: "0.65rem", color: "#C0BEB8" }}>
          はいかがですか？
        </span>
      </div>
    );
  }

  if (state.phase === "accepted") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          height: "1.75rem",
          animation: "aether-fadein 0.2s ease",
        }}
      >
        <span
          style={{
            fontSize: "0.72rem",
            color: COLOR_SAGE,
            background: "rgba(82, 121, 111, 0.08)",
            borderRadius: "20px",
            padding: "0.2rem 0.65rem",
            letterSpacing: "0.05em",
          }}
        >
          ✓ {state.category}
        </span>
      </div>
    );
  }

  // idle: 高さだけ確保してレイアウトを安定させる
  return <div style={{ height: "1.75rem" }} />;
}

// ---------- メインコンポーネント ----------
export default function Lists() {
  const [items, setItems]         = useState<ListItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isAdding, setIsAdding]   = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  // Aether Core 提案ステート
  const [suggestion, setSuggestion] = useState<SuggestionState>({ phase: "idle" });
  // debounce タイマー ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 進行中の推論を識別するトークン（古い結果を捨てるため）
  const suggestionTokenRef = useRef(0);

  const inputRef       = useRef<HTMLInputElement>(null);
  // 同期を一度だけ実行するためのフラグ（Reactのレンダリングサイクルに左右されない）
  const syncStartedRef = useRef(false);
  // コールバック内でstateのstale closureを避けるためのrefミラー
  const accessTokenRef = useRef<string | null>(null);
  const tasklistIdRef  = useRef<string | null>(null);

  // ---------- 同期完了ハンドラ ----------
  const finishSync = useCallback(() => {
    setSyncStatus("done");
  }, []);

  // ---------- 同期本体（命令型呼び出し・依存配列なし） ----------
  //
  // ★ 設計原則:
  //   この関数は useEffect の dep 変化で呼ばれるのではなく、
  //   「マウント時」または「ログイン成功コールバック」から直接（命令型で）呼ばれる。
  //   これにより syncStatus の変化が再実行を引き起こすループを根本から防ぐ。
  //
  const performSync = useCallback(async (token: string) => {
    // フラグを同期的に立てる（StrictMode の二重実行や、誤った二重呼び出しをブロック）
    if (syncStartedRef.current) return;
    syncStartedRef.current = true;

    setSyncStatus("syncing");
    try {
      const lists: GTaskList[] = await getTaskLists(token);
      const found = lists.find((l) => l.title === TASKLIST_NAME) ?? lists[0];

      if (!found) {
        setSyncStatus("idle");
        return;
      }

      tasklistIdRef.current = found.id;

      const gTasks = await getTasks(token, found.id);

      // Firestore の現在値を一度だけ取得
      const currentItems = await new Promise<ListItem[]>((resolve) => {
        const q = query(collection(db, "lists"), orderBy("createdAt", "asc"));
        const unsub = onSnapshot(q, (snap) => {
          unsub(); // 一度読んだら即解除
          resolve(snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ListItem, "id">),
          })));
        });
      });

      const existingGIds = new Set(
        currentItems.filter((i) => i.googleTaskId).map((i) => i.googleTaskId)
      );
      const toImport = gTasks.filter((t) => !existingGIds.has(t.id));

      await Promise.all(
        toImport.map((t) =>
          addDoc(collection(db, "lists"), {
            text: t.title,
            completed: t.status === "completed",
            createdAt: serverTimestamp(),
            googleTaskId: t.id,
          })
        )
      );

      finishSync();
    } catch (e) {
      console.error("Google Tasks同期エラー:", e);
      setSyncStatus("error");
    }
  }, [finishSync]); // finishSync は useCallback([]) で安定

  // ---------- 認証フック（onLogin コールバック経由でログイン後の同期をトリガー） ----------
  const { accessToken, isSignedIn, isReady, signIn, signOut } =
    useGoogleAuth(performSync);

  // accessToken が変わるたびに ref を更新（handlers 内での stale closure 防止）
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  // ---------- マウント時同期（localStorage からトークンが復元済みの場合） ----------
  //
  // ★ 依存配列は意図的に [] — accessToken はマウント時点の値をキャプチャして使用。
  //    ログイン後の同期は上記 onLogin コールバックが担当するため、ここでは不要。
  //
  useEffect(() => {
    const token = accessTokenRef.current; // マウント時点の値
    if (token) performSync(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Firestore リアルタイム購読 ----------
  useEffect(() => {
    const q = query(collection(db, "lists"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ListItem, "id">),
      })));
    });
  }, []);

  // ---------- ログアウト（同期フラグもリセット） ----------
  const handleSignOut = useCallback(() => {
    syncStartedRef.current = false; // 次のログイン時に再同期できるようリセット
    tasklistIdRef.current  = null;
    setSyncStatus("idle");
    signOut();
  }, [signOut]);

  // ---------- Aether Core: 入力値の debounce 推論 ----------
  useEffect(() => {
    // debounce タイマーをクリア
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    const trimmed = inputValue.trim();

    // 入力がなければ提案をリセット
    if (!trimmed) {
      setSuggestion({ phase: "idle" });
      return;
    }

    // accepted 状態の場合、入力が変わったらリセット
    setSuggestion((prev) =>
      prev.phase === "accepted" ? { phase: "idle" } : prev
    );

    // 600ms debounce で推論開始
    debounceTimerRef.current = setTimeout(async () => {
      const token = ++suggestionTokenRef.current; // このリクエストのトークン
      setSuggestion({ phase: "thinking" });

      const result = await suggestCategory(trimmed);

      // トークンが一致する場合のみ状態を更新（古い結果を捨てる）
      if (suggestionTokenRef.current !== token) return;

      if (result) {
        setSuggestion({ phase: "ready", category: result });
      } else {
        setSuggestion({ phase: "idle" });
      }
    }, 600);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [inputValue]);

  // ---------- カテゴリ採用ハンドラ ----------
  const handleAcceptCategory = useCallback((category: string) => {
    setSuggestion({ phase: "accepted", category });
  }, []);

  // ---------- アイテム追加 ----------
  const handleAdd = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    // 現時点での採用カテゴリを取得（クロージャではなく最新の suggestion state を参照）
    const adoptedCategory =
      suggestion.phase === "accepted" ? suggestion.category : undefined;

    setIsAdding(true);
    try {
      const token   = accessTokenRef.current;
      const listId  = tasklistIdRef.current;
      let googleTaskId: string | undefined;

      if (token && listId) {
        setSyncStatus("syncing");
        try {
          googleTaskId = await gAddTask(token, listId, trimmed);
          finishSync();
        } catch (e) {
          console.warn("Google Tasks追加失敗（Firestoreのみ保存）:", e);
          setSyncStatus("error");
        }
      }

      await addDoc(collection(db, "lists"), {
        text: trimmed,
        completed: false,
        createdAt: serverTimestamp(),
        ...(googleTaskId    ? { googleTaskId }    : {}),
        ...(adoptedCategory ? { category: adoptedCategory } : {}),
      });

      setInputValue("");
      setSuggestion({ phase: "idle" });
      suggestionTokenRef.current++; // 保留中の推論を無効化
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      setIsAdding(false);
    }
  }, [inputValue, suggestion, finishSync]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAdd();
  };

  // ---------- 完了トグル ----------
  const handleToggle = useCallback(async (item: ListItem) => {
    const newCompleted = !item.completed;
    await updateDoc(doc(db, "lists", item.id), { completed: newCompleted });

    const token  = accessTokenRef.current;
    const listId = tasklistIdRef.current;
    if (token && listId && item.googleTaskId) {
      setSyncStatus("syncing");
      try {
        await updateTaskStatus(token, listId, item.googleTaskId, newCompleted);
        finishSync();
      } catch (e) {
        console.warn("Google Tasks更新失敗:", e);
        setSyncStatus("error");
      }
    }
  }, [finishSync]); // accessToken/tasklistId は ref 経由なので deps 不要

  const pending = items.filter((i) => !i.completed);
  const done    = items.filter((i) => i.completed);

  // ---------- レンダリング ----------
  return (
    <>
      {/* Aether Core アニメーション定義 */}
      <style>{`
        @keyframes aether-pulse {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 0.9; transform: scale(1.2); }
        }
        @keyframes aether-fadein {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="w-full max-w-xl mx-auto" style={{ padding: "3rem 1.5rem" }}>
        {/* ヘッダー */}
        <div className="flex items-start justify-between" style={{ marginBottom: "2.5rem" }}>
          <div>
            <p
              className="text-xs font-semibold tracking-[0.2em] uppercase"
              style={{ color: "var(--color-accent)", marginBottom: "0.5rem" }}
            >
              Arca / Lists
            </p>
            <h2
              className="text-2xl font-light tracking-wide"
              style={{ color: "var(--color-text)" }}
            >
              買い物リスト
            </h2>
          </div>

          <div style={{ paddingTop: "0.25rem" }}>
            <SyncBadge
              isReady={isReady}
              isSignedIn={isSignedIn}
              syncStatus={syncStatus}
              onSignIn={signIn}
              onSignOut={handleSignOut}
            />
          </div>
        </div>

        {/* 入力エリア */}
        <div
          style={{
            background: "rgba(255,255,255,0.7)",
            borderRadius: "14px",
            padding: "0.75rem 1rem",
            boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="アイテムを追加…"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: "var(--color-text)" }}
              autoFocus
            />
            <button
              onClick={handleAdd}
              disabled={isAdding || !inputValue.trim()}
              className="text-xs font-medium tracking-widest uppercase transition-opacity duration-200 disabled:opacity-30 active:opacity-60"
              style={{ color: "var(--color-accent)" }}
            >
              {isAdding ? "…" : "追加"}
            </button>
          </div>

          {/* Aether Core 提案エリア — 入力カードの内側に静かに配置 */}
          {suggestion.phase !== "idle" && (
            <div style={{ marginTop: "0.5rem", paddingLeft: "0.1rem" }}>
              <CategorySuggestion
                state={suggestion}
                onAccept={handleAcceptCategory}
              />
            </div>
          )}
        </div>

        {/* 余白（提案なし時もレイアウト安定） */}
        <div style={{ marginBottom: "2.5rem" }} />

        {/* 空状態 */}
        {pending.length === 0 && done.length === 0 && (
          <p className="text-sm text-center" style={{ color: "#B0AFA8", padding: "3rem 0" }}>
            リストは空です
          </p>
        )}

        {/* 未完了リスト */}
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {pending.map((item) => (
            <ListRow key={item.id} item={item} onToggle={handleToggle} />
          ))}
        </ul>

        {/* 完了済みセクション */}
        {done.length > 0 && (
          <div style={{ marginTop: "2.5rem" }}>
            <p
              className="text-xs font-semibold tracking-[0.2em] uppercase"
              style={{ color: "#C0BEB8", marginBottom: "1rem" }}
            >
              完了済み
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {done.map((item) => (
                <ListRow key={item.id} item={item} onToggle={handleToggle} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

// ---------- 行コンポーネント ----------
function ListRow({
  item,
  onToggle,
}: {
  item: ListItem;
  onToggle: (item: ListItem) => void;
}) {
  return (
    <li
      className="flex items-center gap-4 cursor-pointer select-none"
      style={{
        padding: "0.9rem 0",
        borderBottom: "1px solid rgba(0,0,0,0.05)",
        opacity: item.completed ? 0.4 : 1,
        transition: "opacity 0.25s",
      }}
      onClick={() => onToggle(item)}
    >
      <CheckIcon completed={item.completed} />
      <span
        className="flex-1 text-sm font-light"
        style={{
          color: "var(--color-text)",
          textDecoration: item.completed ? "line-through" : "none",
          transition: "text-decoration 0.2s",
        }}
      >
        {item.text}
      </span>

      {/* カテゴリバッジ（採用済みの場合のみ表示） */}
      {item.category && (
        <span
          title={`カテゴリ: ${item.category}`}
          style={{
            fontSize: "0.6rem",
            color: "var(--color-accent)",
            background: "rgba(197,160,89,0.08)",
            borderRadius: "20px",
            padding: "0.15rem 0.5rem",
            letterSpacing: "0.05em",
            flexShrink: 0,
            opacity: 0.85,
          }}
        >
          {item.category}
        </span>
      )}

      {item.googleTaskId && (
        <span
          title="Google Tasks と同期済み"
          style={{ color: "#D0CFCA", fontSize: "0.6rem", flexShrink: 0 }}
        >
          ⟳
        </span>
      )}
    </li>
  );
}
