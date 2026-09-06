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

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { ShiftOverrideModal } from "./calendar/ShiftOverrideModal";
import { ShiftBadge } from "./calendar/ShiftBadge";
import { ListIcon } from "./common/ListIcon";

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
  
  // タスクグループ（メタデータ購読用）
  const [categories, setCategories] = useState<TaskListCategory[]>([
    { id: "default", title: "マイタスク", isDefault: true, icon: "sparkle" },
    { id: "shopping", title: "買い物リスト", icon: "cart" },
  ]);
  const listMetaMapRef = useRef<Record<string, { icon?: string }>>({});

  // ─── Firestore task_lists 購読 ───
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

      setCategories((prev) =>
        prev.map((c) => {
          const m = metaMap[c.id];
          return m?.icon ? { ...c, icon: m.icon } : c;
        })
      );
    });

    return () => unsub();
  }, []);

  // カテゴリ用アイコン決定ヘルパー
  const getCategoryIcon = useCallback((catId: string, isShop: boolean, isMyTasks: boolean): string => {
    const saved = listMetaMapRef.current[catId]?.icon;
    if (saved) return saved;
    if (isShop) return "cart";
    if (isMyTasks) return "sparkle";
    return "folder";
  }, []);

  // タスクグループ（リスト名・アイコン）取得ヘルパー
  const getGroupInfo = useCallback((listId?: string) => {
    const id = listId || "default";
    const cat = categories.find((c) => c.id === id);
    if (cat) {
      return {
        title: cat.title,
        icon: cat.icon || (cat.id === "shopping" ? "cart" : cat.id === "default" ? "sparkle" : "folder"),
      };
    }
    if (id === "shopping") return { title: "買い物リスト", icon: "cart" };
    if (id === "default") return { title: "マイタスク", icon: "sparkle" };
    return { title: "マイタスク", icon: "sparkle" };
  }, [categories]);

  // 1週間後（今日から+7日後）の日付 "YYYY-MM-DD"
  const oneWeekLater = useMemo(() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + 7);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, [today]);

  // 期限表示用バッジ情報フォーマッター
  const formatDueDateLabel = useCallback((dueDateStr: string) => {
    const dueTime = new Date(`${dueDateStr}T00:00:00`).getTime();
    const todayTime = new Date(`${today}T00:00:00`).getTime();
    const diffDays = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        text: diffDays === -1 ? "昨日 (期限切れ)" : `${Math.abs(diffDays)}日前 (期限切れ)`,
        color: C.danger,
        background: "rgba(224, 86, 74, 0.08)",
        isOverdue: true,
      };
    }
    if (diffDays === 0) {
      return {
        text: "今日",
        color: C.goldDark,
        background: C.goldFaint,
        isOverdue: false,
      };
    }
    if (diffDays === 1) {
      return {
        text: "明日",
        color: C.charcoalMid,
        background: "rgba(0, 0, 0, 0.04)",
        isOverdue: false,
      };
    }
    const d = new Date(`${dueDateStr}T00:00:00`);
    const dateFormatted = `${d.getMonth() + 1}/${d.getDate()}(${["日", "月", "火", "水", "木", "金", "土"][d.getDay()]})`;
    return {
      text: `${dateFormatted} (あと${diffDays}日)`,
      color: C.charcoalLight,
      background: "rgba(0, 0, 0, 0.03)",
      isOverdue: false,
    };
  }, [today]);

  // 期限が1週間より手前（期限切れを含む）の未完了タスクを一元抽出
  const upcomingTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        if (t.completed) return false;
        if (!t.dueDate) return false;
        return t.dueDate <= oneWeekLater;
      })
      .sort((a, b) => {
        // 期限昇順（過去の期限切れが先頭、今日、明日、…の順）
        const cmp = a.dueDate!.localeCompare(b.dueDate!);
        if (cmp !== 0) return cmp;
        const pOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        const pa = a.priority ? pOrder[a.priority] ?? 3 : 3;
        const pb = b.priority ? pOrder[b.priority] ?? 3 : 3;
        return pa - pb;
      });
  }, [tasks, oneWeekLater]);

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
            id: "default",
            title: "マイタスク",
            isDefault: true,
            icon: getCategoryIcon("default", false, true),
          });
        }
        if (!uniqueCategories.some((u) => u.id === "shopping")) {
          uniqueCategories.push({
            id: "shopping",
            title: "買い物リスト",
            icon: getCategoryIcon("shopping", true, false),
          });
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
      const rawTasks = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaskItem));
      const seenIds = new Set<string>();
      const seenGoogleTaskIds = new Set<string>();
      const sanitized: TaskItem[] = [];

      for (const t of rawTasks) {
        if (seenIds.has(t.id)) continue;
        seenIds.add(t.id);

        if (t.googleTaskId) {
          if (seenGoogleTaskIds.has(t.googleTaskId)) continue;
          seenGoogleTaskIds.add(t.googleTaskId);
        }

        sanitized.push(t);
      }

      setTasks(sanitized);
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

  // 日付の和風フォーマット（カレンダー画面と統一: 例「9月6日(日)」）
  const displayFullDate = new Date().toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div
      className="w-full max-w-6xl mx-auto"
      style={{
        padding: "2.4rem 1.25rem 4rem",
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
          marginBottom: "1.5rem",
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

        {/* 日付・勤務ステータス表示（カレンダーと統一: 「9月6日(日)　休日 2日目」） */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "1.15rem", fontWeight: 700, color: C.charcoal, letterSpacing: "-0.015em" }}>
            {displayFullDate}
          </span>
          <ShiftBadge
            shift={currentShift}
            onClick={() => setShowShiftOverrideModal(true)}
            testId="dashboard-shift-badge"
            size="sm"
          />
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

          {/* ─── タイルB: 期限の近いタスク（全グループ一元表示） ─── */}
          <div
            className="arca-card"
            style={{
              padding: "1.3rem 1.5rem 1.1rem",
              display: "flex",
              flexDirection: "column",
              minHeight: "260px",
              boxSizing: "border-box",
              borderRadius: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: C.charcoal, letterSpacing: "0.02em" }}>
                  期限の近いタスク
                </span>
                <span style={{ fontSize: "0.74rem", color: C.charcoalLight }}>
                  ({upcomingTasks.length})
                </span>
              </div>
              <TileNavButton
                label="タスク"
                onClick={() => onNavigate?.("tasks")}
              />
            </div>

            {/* 内部スクロールコンテンツ */}
            <div style={{ flex: 1, overflowY: "auto", maxHeight: "240px", paddingRight: "0.25rem" }}>
              {upcomingTasks.length === 0 ? (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem 0" }}>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight }}>
                    期限の近いタスクはありません
                  </p>
                </div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {upcomingTasks.map((t, index) => {
                    const group = getGroupInfo(t.listId);
                    const dueInfo = formatDueDateLabel(t.dueDate!);

                    return (
                      <li
                        key={t.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.6rem",
                          padding: "0.4rem 0",
                          borderBottom: index === upcomingTasks.length - 1 ? "none" : "1px solid rgba(0, 0, 0, 0.03)",
                        }}
                      >
                        {/* 左側: チェックボタン ＋ タイトル ＋ 期限バッジ */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flex: 1, minWidth: 0 }}>
                          <button
                            onClick={() => toggleTask(t.id, t.completed)}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0, flexShrink: 0 }}
                            title={t.completed ? "未完了に戻す" : "完了にする"}
                          >
                            <CheckCircle completed={t.completed} />
                          </button>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flex: 1, minWidth: 0, overflow: "hidden" }}>
                            <span
                              style={{
                                fontSize: "0.88rem",
                                color: t.completed ? C.charcoalLight : C.charcoal,
                                textDecoration: t.completed ? "line-through" : "none",
                                lineHeight: 1.35,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {t.title}
                            </span>
                            {/* 期限バッジ */}
                            <span
                              style={{
                                fontSize: "0.65rem",
                                fontWeight: dueInfo.isOverdue ? 700 : 550,
                                color: dueInfo.color,
                                background: dueInfo.background,
                                padding: "0.1rem 0.38rem",
                                borderRadius: "4px",
                                flexShrink: 0,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {dueInfo.text}
                            </span>
                          </div>

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
                        </div>

                        {/* 右側: タスクグループ表示 */}
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.28rem",
                            padding: "0.15rem 0.45rem",
                            borderRadius: "6px",
                            background: "rgba(0, 0, 0, 0.035)",
                            fontSize: "0.68rem",
                            color: C.charcoalLight,
                            fontWeight: 500,
                            flexShrink: 0,
                            maxWidth: "130px",
                          }}
                          title={`タスクグループ: ${group.title}`}
                        >
                          <ListIcon icon={group.icon} size="0.72rem" style={{ opacity: 0.75, flexShrink: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {group.title}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
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

    </div>
  );
}
