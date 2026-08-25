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

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { CalendarEvent, TaskItem, ListItem, NoteItem, SyncStatus } from "../types";
import type { PMSettings, PMTemplateItem, PMLogItem } from "../types/pm";
import type { Recipe } from "../types/recipe";
import { subscribeRecipes } from "../lib/recipeStorage";
import { C } from "../lib/designSystem";
import {
  recordPMLog,
  buildLogMapForDate,
  resolveItemStatus,
  resolveShiftInfo,
  saveShiftOverride,
  getActivePMTasksForDate,
  DEFAULT_PM_SETTINGS,
} from "../services/pmCycleService";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import { syncGoogleCalendarToArca } from "../services/googleCalendarSync";
import { PMShiftOverrideModal } from "./tasks/PMShiftOverrideModal";

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
  const [lists, setLists] = useState<ListItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [taskTab, setTaskTab] = useState<"tasks" | "lists">("tasks");

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
  const [pmTemplates, setPmTemplates] = useState<PMTemplateItem[]>([]);
  const [pmLogs, setPmLogs] = useState<PMLogItem[]>([]);
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
    const unsub = onSnapshot(query(collection(db, "lists"), orderBy("createdAt", "asc")), (snap) => {
      setLists(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ListItem)));
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

  // PM 設定・テンプレート・ログ
  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, "pm_settings", "main"), (snap) => {
      if (snap?.exists?.()) {
        setPmSettings(snap.data() as PMSettings);
      } else {
        getDoc(doc(db, "pm_settings", "config")).then((cSnap) => {
          if (cSnap?.exists?.()) setPmSettings(cSnap.data() as PMSettings);
        });
      }
    });

    const unsubTemplates = onSnapshot(
      query(collection(db, "pm_templates"), orderBy("dayIndex", "asc")),
      (snap) => setPmTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PMTemplateItem)))
    );

    const unsubLogs = onSnapshot(
      query(collection(db, "pm_logs"), where("date", "==", today)),
      (snap) => setPmLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PMLogItem)))
    );

    return () => {
      unsubSettings();
      unsubTemplates();
      unsubLogs();
    };
  }, [today]);

  // フィルタリング（無題ノートや削除済み、出勤計算専用の isShiftOnly 予定を除外）
  const todayEvents = events
    .filter((e) => e.date === today && !e.isShiftOnly)
    .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  const todayTasks = tasks.filter((t) => !t.completed && (t.dueDate === today || !t.dueDate));
  const activeLists = lists.filter((l) => !l.completed);
  const activeNotes = notes.filter((n) => !n.isDeleted && (n.title.trim() !== "" || n.content.trim() !== ""));
  const recentNotes = activeNotes.slice(0, 6);

  const activeRecipes = recipes.filter((r) => !r.isDeleted);
  const recentRecipes = activeRecipes.slice(0, 5);

  // シフト判定（オーバーライド優先）
  const currentShift = resolveShiftInfo(today, events, pmSettings);

  // PM 今日のプレビュー（未完了・完了含む、最大2件）
  const pmTodayAll = pmSettings ? getActivePMTasksForDate(today, pmTemplates, events, pmSettings) : [];
  const pmLogMap = buildLogMapForDate(pmLogs, today);
  const pmTodayPending = pmTodayAll.filter((item) => resolveItemStatus(item, pmLogMap) === "pending");
  const pmTodayItems = pmTodayPending.slice(0, 2);

  // タスク完了トグル
  const toggleTask = useCallback(async (id: string, current: boolean) => {
    await updateDoc(doc(db, "tasks", id), { completed: !current });
  }, []);

  // PM 完了トグル
  const togglePMTask = useCallback(async (item: PMTemplateItem) => {
    try {
      await recordPMLog({
        date: today,
        templateId: item.id,
        dayIndex: currentShift.streakNumber,
        title: item.title,
        status: "completed",
      });
    } catch (err) {
      console.error("Failed to record PM log from dashboard:", err);
    }
  }, [today, currentShift.streakNumber]);

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

  // 買い物完了トグル
  const toggleList = useCallback(async (id: string, current: boolean) => {
    await updateDoc(doc(db, "lists", id), { completed: !current });
  }, []);

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

        {/* 出勤ステータスバッジ（クリックで手動調整モーダルを開く） */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <button
            type="button"
            data-testid="dashboard-shift-badge"
            onClick={() => setShowShiftOverrideModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              background: currentShift.type === "holiday" ? "rgba(82, 121, 111, 0.12)" : "rgba(197, 160, 89, 0.12)",
              color: currentShift.type === "holiday" ? C.sage : C.goldDark,
              border: `1px solid ${currentShift.type === "holiday" ? "rgba(82, 121, 111, 0.2)" : "rgba(197, 160, 89, 0.2)"}`,
              padding: "0.32rem 0.75rem",
              borderRadius: "9999px",
              fontSize: "0.76rem",
              fontWeight: 650,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            title="クリックして勤務・休日ステータスを手動補正"
          >
            <span>
              {currentShift.type === "holiday"
                ? `🌙 休日 ${currentShift.streakNumber}日目`
                : `✦ 出勤 ${currentShift.streakNumber}日目${currentShift.shiftName ? ` (${currentShift.shiftName})` : ""}`}
            </span>
          </button>
          <p style={{ fontSize: "0.78rem", color: C.charcoalLight, margin: 0, letterSpacing: "0.01em" }}>
            {displayDate}
          </p>
        </div>
      </div>

      {/* 出勤ステータス確認 & 手動調整モーダル */}
      <PMShiftOverrideModal
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

          {/* ─── タイルB: 今日のタスク ＆ 買い物リスト（一体化タイル） ─── */}
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8rem", gap: "0.5rem", flexWrap: "wrap" }}>
              {/* 小タブ切り替え: [ ✦ タスク | 🛒 買い物 ] */}
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
                  type="button"
                  onClick={() => setTaskTab("tasks")}
                  style={{
                    border: "none",
                    borderRadius: "9999px",
                    padding: "0.26rem 0.7rem",
                    fontSize: "0.76rem",
                    fontWeight: taskTab === "tasks" ? 700 : 500,
                    color: taskTab === "tasks" ? C.charcoal : C.charcoalLight,
                    background: taskTab === "tasks" ? C.white : "transparent",
                    boxShadow: taskTab === "tasks" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  ✦ タスク ({todayTasks.length + pmTodayItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskTab("lists")}
                  style={{
                    border: "none",
                    borderRadius: "9999px",
                    padding: "0.26rem 0.7rem",
                    fontSize: "0.76rem",
                    fontWeight: taskTab === "lists" ? 700 : 500,
                    color: taskTab === "lists" ? C.charcoal : C.charcoalLight,
                    background: taskTab === "lists" ? C.white : "transparent",
                    boxShadow: taskTab === "lists" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  🛒 買い物 ({activeLists.length})
                </button>
              </div>

              {/* 遷移ボタン */}
              {taskTab === "tasks" ? (
                <TileNavButton
                  label="タスク"
                  onClick={() => onNavigate?.("tasks")}
                />
              ) : (
                <TileNavButton
                  label="買い物リスト"
                  onClick={() => onNavigate?.("lists")}
                />
              )}
            </div>

            {/* 内部スクロールコンテンツ */}
            <div style={{ flex: 1, overflowY: "auto", maxHeight: "240px", paddingRight: "0.25rem" }}>
              {taskTab === "tasks" ? (
                /* ─── タスク一覧表示 ─── */
                todayTasks.length === 0 && pmTodayItems.length === 0 ? (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem 0" }}>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight }}>
                      残っているタスクはありません
                    </p>
                  </div>
                ) : (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {todayTasks.map((t) => (
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
                              fontSize: "0.68rem",
                              fontWeight: 600,
                              color: C.danger,
                              background: "rgba(224, 86, 74, 0.08)",
                              padding: "0.15rem 0.45rem",
                              borderRadius: "4px",
                              flexShrink: 0,
                            }}
                          >
                            高
                          </span>
                        )}
                      </li>
                    ))}

                    {/* PM プレビュー（最大2件） */}
                    {pmTodayItems.map((item) => (
                      <li
                        key={`pm-${item.id}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          padding: "0.45rem 0.55rem",
                          borderBottom: "1px solid rgba(0, 0, 0, 0.03)",
                          background: C.goldFaint,
                          borderRadius: "10px",
                          transition: "background 0.15s ease",
                        }}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePMTask(item);
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}
                          title="クリックで完了を記録"
                        >
                          <CheckCircle completed={false} />
                        </button>
                        <div
                          onClick={() => onNavigate?.("tasks")}
                          style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            gap: "0.45rem",
                            cursor: "pointer",
                            minWidth: 0,
                          }}
                          title="クリックでタスク画面のPMセクションへ移動"
                        >
                          <span
                            style={{
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              color: currentShift.type === "holiday" ? C.sage : C.goldDark,
                              background: currentShift.type === "holiday" ? "rgba(82, 121, 111, 0.15)" : "rgba(197, 160, 89, 0.15)",
                              padding: "0.1rem 0.45rem",
                              borderRadius: "4px",
                              flexShrink: 0,
                            }}
                          >
                            {currentShift.type === "holiday" ? "PM 休日" : "PM 出勤"}
                          </span>
                          <span
                            style={{
                              fontSize: "0.86rem",
                              color: C.charcoal,
                              lineHeight: 1.35,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.title}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                /* ─── 買い物リスト一覧表示 ─── */
                activeLists.length === 0 ? (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem 0" }}>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight }}>
                      未購入アイテムはありません
                    </p>
                  </div>
                ) : (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {activeLists.map((item) => (
                      <li
                        key={item.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          padding: "0.4rem 0",
                          borderBottom: "1px solid rgba(0, 0, 0, 0.03)",
                        }}
                      >
                        <button
                          onClick={() => toggleList(item.id, item.completed)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}
                          title={item.completed ? "未購入に戻す" : "購入済みにする"}
                        >
                          <CheckCircle completed={item.completed} />
                        </button>
                        <span style={{ flex: 1, fontSize: "0.88rem", color: C.charcoal }}>
                          {item.text}
                        </span>
                        {item.category && (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              color: C.charcoalLight,
                              background: "rgba(0, 0, 0, 0.04)",
                              padding: "0.15rem 0.5rem",
                              borderRadius: "6px",
                              flexShrink: 0,
                            }}
                          >
                            {item.category}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )
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
    </div>
  );
}
