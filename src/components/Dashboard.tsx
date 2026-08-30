/**
 * src/components/Dashboard.tsx
 * Arca — Dashboard / Bento Grid レイアウト (Apple HIG × Arca 準拠)
 *
 * 設計方針 (Core/Rules.md):
 *  - 道具としての静けさ、1画面に収まる美しい Bento Grid タイル
 *  - PC画面: 画面全体（100vh活用）の大型 2×2 グリッドで俯瞰、スクロール不要
 *  - 4大タイル: Calendar（予定）, Tasks（タスク）, Lists（買い物）, Notes（直近ノート）
 *  - 各タイル内部スクロール（overflow-y-auto）とモバイル縦スクロール対応
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { CalendarEvent, TaskItem, NoteItem, TaskListCategory, SyncStatus } from "../types";
import type { PMSettings } from "../types/pm";
import type { Recipe } from "../types/recipe";
import { subscribeRecipes } from "../lib/recipeStorage";
import { C } from "../lib/designSystem";
import {
  resolveShiftInfo,
  saveShiftOverride,
  DEFAULT_PM_SETTINGS,
} from "../services/pmCycleService";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import { syncGoogleCalendarToArca } from "../services/googleCalendarSync";
import { getTaskLists, type GTaskList } from "../lib/googleTasks";
import { createGoogleTaskList } from "../services/googleTasksSync";
import { ShiftOverrideModal } from "./calendar/ShiftOverrideModal";
import { ShiftBadge } from "./calendar/ShiftBadge";

// ---------- ユーティリティ ----------
function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayStr(): string {
  const t = new Date();
  return toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
}

// ---------- アイコン ----------
function CheckCircle({ completed }: { completed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.75}
      style={{
        width: "1.15rem",
        height: "1.15rem",
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

function ChevronRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={2.2}
      stroke="currentColor"
      style={{
        width: "0.72rem",
        height: "0.72rem",
        flexShrink: 0,
        transition: "transform 0.16s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
}

function TileNavButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.22rem",
        fontSize: "0.74rem",
        color: C.goldDark,
        background: "transparent",
        border: "none",
        borderRadius: "6px",
        padding: "0.2rem 0.45rem",
        marginRight: "-0.35rem",
        cursor: "pointer",
        fontWeight: 600,
        letterSpacing: "0.01em",
        userSelect: "none",
        transition: "background 0.15s ease, color 0.15s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(197, 160, 89, 0.08)";
        const svg = e.currentTarget.querySelector("svg");
        if (svg) svg.style.transform = "translateX(2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        const svg = e.currentTarget.querySelector("svg");
        if (svg) svg.style.transform = "translateX(0)";
      }}
    >
      <span>{label}</span>
      <ChevronRight />
    </button>
  );
}

export type Module = "dashboard" | "tasks" | "lists" | "calendar" | "notes" | "recipes";

export interface DashboardProps {
  onNavigate?: (module: Module) => void;
  onSelectNote?: (noteId: string) => void;
}

// ---------- メインコンポーネント ----------
export default function Dashboard({ onNavigate, onSelectNote }: DashboardProps = {}) {
  const today = todayStr();

  // Google カレンダー同期
  const { isSignedIn, accessToken, signIn } = useGoogleAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  
  // タスクグループ（動的タブ）
  const [categories, setCategories] = useState<TaskListCategory[]>([
    { id: "default", title: "マイタスク", isDefault: true },
    { id: "shopping", title: "買い物リスト" },
  ]);
  const [activeListId, setActiveListId] = useState<string>("default");

  // 新規リスト作成モーダル
  const [showAddListModal, setShowAddListModal] = useState(false);
  const [newListName, setNewListName] = useState("");

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
    top: 2,
    width: 0,
    height: 0,
    ready: false,
  });

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

  // Google Tasks リスト同期
  useEffect(() => {
    if (!isSignedIn || !accessToken) return;
    let isCancelled = false;

    async function initGoogleLists() {
      try {
        const gLists: GTaskList[] = await getTaskLists(accessToken!);
        if (isCancelled || !gLists || gLists.length === 0) return;

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

        const uniqueCategories: TaskListCategory[] = [];
        for (const cat of mappedCategories) {
          if (!uniqueCategories.some((u) => u.id === cat.id)) {
            uniqueCategories.push(cat);
          }
        }
        if (!uniqueCategories.some((u) => u.id === "default")) {
          uniqueCategories.unshift({ id: "default", title: "マイタスク", isDefault: true });
        }
        if (!uniqueCategories.some((u) => u.id === "shopping")) {
          uniqueCategories.push({ id: "shopping", title: "買い物リスト" });
        }

        setCategories(uniqueCategories);
      } catch (err) {
        console.error("Dashboard Google Tasks list sync error:", err);
      }
    }

    initGoogleLists();
    return () => {
      isCancelled = true;
    };
  }, [isSignedIn, accessToken]);

  // 新規リスト作成ハンドラ
  const handleCreateList = async () => {
    const title = newListName.trim().slice(0, 15);
    if (!title) return;

    let googleListId: string | undefined;
    if (isSignedIn && accessToken) {
      try {
        const createdGList = await createGoogleTaskList(accessToken, title);
        googleListId = createdGList.id;
      } catch (err) {
        console.error("Failed to create Google TaskList from Dashboard:", err);
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

  // 手動同期ハンドラ
  const handleManualSync = useCallback(async () => {
    if (!isSignedIn || !accessToken) return;
    setSyncStatus("syncing");
    try {
      await syncGoogleCalendarToArca(accessToken, events.length > 0 ? events : undefined);
      setSyncStatus("done");
      setTimeout(() => setSyncStatus("idle"), 3000);
    } catch (err) {
      console.error("Dashboard Google sync error:", err);
      setSyncStatus("error");
    }
  }, [isSignedIn, accessToken, events]);

  // PM ステート
  const [pmSettings, setPmSettings] = useState<PMSettings | null>(null);
  const [showShiftOverrideModal, setShowShiftOverrideModal] = useState(false);

  // Firestore リアルタイム同期
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "events"), orderBy("createdAt", "asc")), (snap) => {
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CalendarEvent)));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "tasks"), orderBy("createdAt", "asc")), (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaskItem)));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "notes"), orderBy("updatedAt", "desc")), (snap) => {
      setNotes(
        snap.docs.map((d) => ({
          id: d.id,
          title: d.data().title || "",
          content: d.data().content || "",
          tags: d.data().tags || [],
          createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate().toISOString() : new Date().toISOString(),
          updatedAt: d.data().updatedAt?.toDate ? d.data().updatedAt.toDate().toISOString() : new Date().toISOString(),
          isDeleted: !!d.data().isDeleted,
        }))
      );
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeRecipes((fetched) => {
      setRecipes(fetched);
    });
    return () => unsub();
  }, []);

  // 勤務シフト設定
  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, "shift_settings", "main"), (snap) => {
      if (snap?.exists?.()) {
        setPmSettings(snap.data() as PMSettings);
      }
    });

    return () => {
      unsubSettings();
    };
  }, [today]);

  // フィルタリング（無題ノートや削除済み、出勤計算専用の isShiftOnly 予定を除外）
  const todayEvents = events
    .filter((e) => e.date === today && !e.isShiftOnly)
    .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  const activeNotes = notes.filter((n) => !n.isDeleted && (n.title.trim() !== "" || n.content.trim() !== ""));
  const recentNotes = activeNotes.slice(0, 6);

  const activeRecipes = recipes.filter((r) => !r.isDeleted);
  const recentRecipes = activeRecipes.slice(0, 5);

  // シフト判定（オーバーライド優先）
  const currentShift = resolveShiftInfo(today, events, pmSettings);

  // タスク完了トグル
  const toggleTask = useCallback(async (id: string, current: boolean) => {
    await updateDoc(doc(db, "tasks", id), { completed: !current });
  }, []);

  // 手動オーバーライド保存ハンドラ（楽観的即時反映）
  const handleSaveShiftOverride = useCallback(
    async (override: any) => {
      // 1. ローカルステート即時更新（0ms 反映）
      setPmSettings((prev) => {
        const current = prev || { ...DEFAULT_PM_SETTINGS };
        const newOverrides = { ...(current.overrides || {}) };
        if (override === null) {
          delete newOverrides[today];
        } else {
          newOverrides[today] = {
            date: today,
            type: override.type,
            streakNumber: override.streakNumber,
            shiftName: override.shiftName,
            updatedAt: new Date().toISOString(),
          };
        }
        return { ...current, overrides: newOverrides };
      });

      // 2. 永続化保存
      try {
        await saveShiftOverride(today, override);
      } catch (err) {
        console.error("Failed to save shift override:", err);
      }
    },
    [today]
  );

  // 日付の和風フォーマット
  const displayDate = new Date().toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div
      className="w-full max-w-6xl mx-auto"
      style={{
        padding: "1.8rem 1.25rem 4rem",
        boxSizing: "border-box",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ─── ヘッダー: 日付 & 出勤ステータスバッジ（Apple HIG 準拠） ─── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.25rem",
          padding: "0 0.25rem",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <p style={{ fontSize: "0.68rem", fontWeight: 650, color: C.charcoalLight, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>
            TODAY & DASHBOARD
          </p>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 750, color: C.charcoal, margin: "0.15rem 0 0", letterSpacing: "-0.03em" }}>
            ダッシュボード
          </h1>
        </div>

        {/* 勤務ステータスバッジ（クリックで手動調整モーダルを開く） */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <ShiftBadge
            shift={currentShift}
            onClick={() => setShowShiftOverrideModal(true)}
            testId="dashboard-shift-badge"
          />
          <p style={{ fontSize: "0.78rem", color: C.charcoalLight, margin: 0, letterSpacing: "0.01em" }}>
            {displayDate}
          </p>
        </div>
      </div>

      {/* 出勤ステータス確認 & 手動調整モーダル */}
      <ShiftOverrideModal
        isOpen={showShiftOverrideModal}
        targetDate={today}
        currentShift={currentShift}
        events={events}
        googleSyncStatus={syncStatus}
        isGoogleSignedIn={isSignedIn}
        onGoogleSignIn={signIn}
        onGoogleSync={handleManualSync}
        onClose={() => setShowShiftOverrideModal(false)}
        onSave={handleSaveShiftOverride}
      />

      {/* ─── Bento Grid 2カラムレイアウト（左: 予定 / タスク＆買い物 / レシピ, 右: 最近のノート） ─── */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 440px), 1fr))",
          gap: "1.25rem",
          alignItems: "start",
        }}
      >
        {/* ─── 左カラム（予定、タスク＆買い物リスト、料理レシピ） ─── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          
          {/* ─── タイルA: Calendar（今日の予定） ─── */}
          <div
            className="arca-card"
            style={{
              padding: "1.3rem 1.5rem 1.1rem",
              display: "flex",
              flexDirection: "column",
              minHeight: "240px",
              boxSizing: "border-box",
              borderRadius: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: C.charcoal, letterSpacing: "0.02em" }}>
                  今日の予定
                </span>
                <span style={{ fontSize: "0.74rem", color: C.charcoalLight }}>
                  ({todayEvents.length})
                </span>
              </div>
              <TileNavButton
                label="カレンダー"
                onClick={() => onNavigate?.("calendar")}
              />
            </div>

            {/* 内部スクロール */}
            <div style={{ flex: 1, overflowY: "auto", maxHeight: "200px", paddingRight: "0.25rem" }}>
              {todayEvents.length === 0 ? (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem 0" }}>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight }}>
                    今日の予定はありません
                  </p>
                </div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                  {todayEvents.map((e) => (
                    <li
                      key={e.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.85rem",
                        padding: "0.35rem 0",
                        borderBottom: "1px solid rgba(0, 0, 0, 0.03)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.78rem",
                          color: C.gold,
                          fontWeight: 650,
                          fontFamily: "-apple-system, monospace",
                          flexShrink: 0,
                          width: "3.4rem",
                        }}
                      >
                        {e.startTime || "--:--"}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: "0.88rem", color: C.charcoal, fontWeight: 450 }}>
                          {e.title}
                        </p>
                        {e.note && (
                          <p style={{ margin: "0.15rem 0 0", fontSize: "0.74rem", color: C.charcoalLight }}>
                            {e.note}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ─── タイルB: タスク ＆ リスト（動的グループ・Sliding Pill付き） ─── */}
          <div
            className="arca-card"
            style={{
              padding: "1.3rem 1.5rem 1.1rem",
              display: "flex",
              flexDirection: "column",
              minHeight: "280px",
              boxSizing: "border-box",
              borderRadius: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8rem", gap: "0.5rem" }}>
              {/* 動的タスクグループタブ（Sliding Pill アニメーション付き） */}
              <div
                ref={tabTrackRef}
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  background: "rgba(0, 0, 0, 0.05)",
                  padding: "2px",
                  borderRadius: "9999px",
                  gap: "2px",
                  overflowX: "auto",
                  scrollbarWidth: "none",
                  maxWidth: "calc(100% - 70px)",
                }}
              >
                {/* 移動する白い楕円ピル */}
                <div
                  style={{
                    position: "absolute",
                    top: pillStyle.top,
                    left: 0,
                    transform: `translate3d(${pillStyle.left}px, 0, 0)`,
                    width: pillStyle.width,
                    height: pillStyle.height,
                    background: C.white,
                    borderRadius: "9999px",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
                    transition: pillStyle.ready
                      ? "transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), width 0.28s cubic-bezier(0.16, 1, 0.3, 1)"
                      : "none",
                    pointerEvents: "none",
                    zIndex: 0,
                    opacity: pillStyle.width > 0 ? 1 : 0,
                  }}
                />

                {categories.map((cat) => {
                  const isActive = activeListId === cat.id;
                  const count = tasks.filter(
                    (t) => (t.listId || "default") === cat.id && !t.completed
                  ).length;
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
                        padding: "0.3rem 0.75rem",
                        minWidth: "auto",
                        flexShrink: 0,
                        boxSizing: "border-box",
                      }}
                    >
                      <button
                        type="button"
                        data-testid={`dashboard-tab-${cat.id}`}
                        onClick={() => setActiveListId(cat.id)}
                        style={{
                          border: "none",
                          background: "transparent",
                          fontSize: "0.78rem",
                          fontWeight: isActive ? 700 : 500,
                          color: isActive ? C.charcoal : C.charcoalLight,
                          cursor: "pointer",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          minWidth: 0,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cat.id === "shopping" && <span style={{ marginRight: "3px", flexShrink: 0 }}>🛒</span>}
                        {cat.id === "default" && <span style={{ marginRight: "3px", flexShrink: 0 }}>✦</span>}
                        <span
                          style={{
                            maxWidth: "160px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={cat.title}
                        >
                          {cat.title}
                        </span>
                        <span style={{ fontSize: "0.7rem", opacity: 0.8, marginLeft: "4px", flexShrink: 0, fontWeight: 550 }}>
                          ({count})
                        </span>
                      </button>
                    </div>
                  );
                })}

                {/* ＋ 新しいリスト追加ボタン */}
                <button
                  type="button"
                  data-testid="dashboard-add-list-btn"
                  onClick={() => setShowAddListModal(true)}
                  style={{
                    position: "relative",
                    zIndex: 1,
                    border: "none",
                    background: "transparent",
                    padding: "0.26rem 0.5rem",
                    fontSize: "0.75rem",
                    fontWeight: 650,
                    color: C.goldDark,
                    cursor: "pointer",
                    flexShrink: 0,
                    lineHeight: 1,
                  }}
                  title="新しいリストを作成"
                >
                  ＋
                </button>
              </div>

              {/* 遷移ボタン */}
              <TileNavButton
                label="タスク"
                onClick={() => onNavigate?.("tasks")}
              />
            </div>

            {/* 内部スクロールコンテンツ */}
            <div style={{ flex: 1, overflowY: "auto", maxHeight: "240px", paddingRight: "0.25rem" }}>
              {(() => {
                const currentFilteredTasks = tasks.filter(
                  (t) => (t.listId || "default") === activeListId && !t.completed
                );

                if (currentFilteredTasks.length === 0) {
                  return (
                    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem 0" }}>
                      <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight }}>
                        残っているアイテムはありません
                      </p>
                    </div>
                  );
                }

                return (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {currentFilteredTasks.map((t) => (
                      <li
                        key={t.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          padding: "0.4rem 0",
                          borderBottom: "1px solid rgba(0, 0, 0, 0.03)",
                        }}
                      >
                        <button
                          onClick={() => toggleTask(t.id, t.completed)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}
                          title={t.completed ? "未完了に戻す" : "完了にする"}
                        >
                          <CheckCircle completed={t.completed} />
                        </button>
                        <span
                          style={{
                            flex: 1,
                            fontSize: "0.88rem",
                            color: t.completed ? C.charcoalLight : C.charcoal,
                            textDecoration: t.completed ? "line-through" : "none",
                            lineHeight: 1.35,
                          }}
                        >
                          {t.title}
                        </span>
                        {t.priority === "high" && (
                          <span
                            style={{
                              fontSize: "0.65rem",
                              fontWeight: 600,
                              color: C.danger,
                              background: "rgba(224, 86, 74, 0.08)",
                              padding: "0.12rem 0.4rem",
                              borderRadius: "4px",
                              flexShrink: 0,
                            }}
                          >
                            高
                          </span>
                        )}
                        {t.priority === "low" && (
                          <span
                            style={{
                              fontSize: "0.65rem",
                              fontWeight: 600,
                              color: "#4A709C",
                              background: "rgba(74, 112, 156, 0.08)",
                              padding: "0.12rem 0.4rem",
                              borderRadius: "4px",
                              flexShrink: 0,
                            }}
                          >
                            低
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
          </div>

          {/* ─── タイルC: Recipes（料理レシピ） ─── */}
          <div
            className="arca-card"
            style={{
              padding: "1.3rem 1.5rem 1.1rem",
              display: "flex",
              flexDirection: "column",
              minHeight: "240px",
              boxSizing: "border-box",
              borderRadius: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: C.charcoal, letterSpacing: "0.02em" }}>
                  料理レシピ
                </span>
                <span style={{ fontSize: "0.74rem", color: C.charcoalLight }}>
                  ({activeRecipes.length})
                </span>
              </div>
              <TileNavButton
                label="レシピ"
                onClick={() => onNavigate?.("recipes")}
              />
            </div>

            {/* 内部スクロール */}
            <div style={{ flex: 1, overflowY: "auto", maxHeight: "200px", paddingRight: "0.25rem" }}>
              {recentRecipes.length === 0 ? (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem 0" }}>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight }}>
                    登録されたレシピはありません
                  </p>
                </div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                  {recentRecipes.map((recipe) => (
                    <li
                      key={recipe.id}
                      onClick={() => onNavigate?.("recipes")}
                      style={{
                        padding: "0.5rem 0.6rem",
                        borderRadius: "10px",
                        background: "rgba(0, 0, 0, 0.015)",
                        cursor: "pointer",
                        transition: "background 0.15s ease",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLLIElement).style.background = "rgba(0, 0, 0, 0.04)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLLIElement).style.background = "rgba(0, 0, 0, 0.015)";
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          {recipe.favorite && (
                            <span style={{ color: C.gold, fontSize: "0.75rem" }}>★</span>
                          )}
                          <p style={{ margin: 0, fontSize: "0.86rem", fontWeight: 600, color: C.charcoal, letterSpacing: "0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {recipe.title}
                          </p>
                        </div>
                        {recipe.ingredients && recipe.ingredients.length > 0 && (
                          <p style={{ margin: "0.15rem 0 0", fontSize: "0.72rem", color: C.charcoalLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {recipe.ingredients.slice(0, 3).map((i) => i.name).join(" / ")}
                          </p>
                        )}
                      </div>
                      {(recipe.servings || (recipe.tags && recipe.tags.length > 0)) && (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            color: C.charcoalLight,
                            background: "rgba(0, 0, 0, 0.04)",
                            padding: "0.15rem 0.45rem",
                            borderRadius: "6px",
                            flexShrink: 0,
                          }}
                        >
                          {recipe.servings || recipe.tags[0]}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

        </div>

        {/* ─── 右カラム（最近のノート: 右側に広々と配置） ─── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          
          {/* ─── タイルD: Notes（最近のノート） ─── */}
          <div
            className="arca-card"
            style={{
              padding: "1.4rem 1.6rem 1.2rem",
              display: "flex",
              flexDirection: "column",
              minHeight: "520px",
              boxSizing: "border-box",
              borderRadius: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ fontSize: "0.95rem", fontWeight: 700, color: C.charcoal, letterSpacing: "0.02em" }}>
                  最近のノート
                </span>
                <span style={{ fontSize: "0.74rem", color: C.charcoalLight }}>
                  ({activeNotes.length})
                </span>
              </div>
              <TileNavButton
                label="ノート"
                onClick={() => onNavigate?.("notes")}
              />
            </div>

            {/* 内部スクロール */}
            <div style={{ flex: 1, overflowY: "auto", paddingRight: "0.25rem" }}>
              {recentNotes.length === 0 ? (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 0" }}>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight }}>
                    ノートはまだありません
                  </p>
                </div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {recentNotes.map((note) => (
                    <li
                      key={note.id}
                      onClick={() => {
                        if (onSelectNote) {
                          onSelectNote(note.id);
                        } else if (onNavigate) {
                          onNavigate("notes");
                        }
                      }}
                      style={{
                        padding: "0.75rem 0.85rem",
                        borderRadius: "12px",
                        background: "rgba(0, 0, 0, 0.015)",
                        cursor: "pointer",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLLIElement).style.background = "rgba(0, 0, 0, 0.04)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLLIElement).style.background = "rgba(0, 0, 0, 0.015)";
                      }}
                    >
                      <p style={{ margin: 0, fontSize: "0.92rem", fontWeight: 650, color: C.charcoal, letterSpacing: "0.01em" }}>
                        {note.title}
                      </p>
                      {note.content && (
                        <p
                          style={{
                            margin: "0.25rem 0 0",
                            fontSize: "0.76rem",
                            color: C.charcoalLight,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            lineHeight: 1.4,
                          }}
                        >
                          {note.content.slice(0, 80)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

        </div>

      </div>

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
              <span style={{ fontSize: "0.72rem", color: newListName.length >= 15 ? C.danger : C.charcoalLight }}>
                {newListName.length}/15
              </span>
            </div>
            <input
              type="text"
              value={newListName}
              maxLength={15}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateList();
              }}
              placeholder="リスト名（最大15文字）"
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
    </div>
  );
}
