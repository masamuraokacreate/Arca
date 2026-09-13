/**
 * src/components/Dashboard.tsx
 * Arca — 4勤2休サイクル完全同期型ダッシュボード（Cycle Ribbon & 3カラム）
 *
 * 設計方針 (Core/Rules.md):
 *  - 4勤2休（出勤4日＋休日2日）に完全同期した司令塔（Cockpit）
 *  - 最上部に「4勤2休 サイクル・リボン（CycleRibbon）」
 *  - デスクトップ大画面の余白を解消した「機能別3カラム構成」
 *    - Column 1: アクション（行動）: 予定 ＆ タスク ＆ クイック追加
 *    - Column 2: ライフ（生活基盤）: 今サイクルの献立・買い物導線
 *    - Column 3: ナレッジ・ストック（知識・思考）: 最近のノート ＆ クイックメモ
 *  - 絵文字完全排除（Lucide React SVGアイコンのみ）
 *  - 境界線排除、微細二重シャドウ、Apple HIG準拠の余白とタイポグラフィ
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { CalendarEvent, TaskItem, NoteItem, TaskListCategory, SyncStatus } from "../types";
import type { PMSettings, PMTemplateItem } from "../types/pm";
import type { Recipe } from "../types/recipe";
import { subscribeRecipes } from "../lib/recipeStorage";
import {
  resolveShiftInfo,
  saveShiftOverride,
  DEFAULT_PM_SETTINGS,
  calculateFourTwoCycleRange,
} from "../services/pmCycleService";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import {
  syncGoogleCalendarToArca,
  createGoogleCalendarEvent,
} from "../services/googleCalendarSync";
import { getTaskLists, type GTaskList } from "../lib/googleTasks";
import { ShiftOverrideModal } from "./calendar/ShiftOverrideModal";
import { ShiftBadge } from "./calendar/ShiftBadge";
import { CycleRibbon } from "./dashboard/CycleRibbon";
import { CycleEventsCard, UpcomingTasksCard } from "./dashboard/ActionColumn";
import { CycleMenuCard, ShoppingListCard } from "./dashboard/LifeFinanceColumn";
import { RecentNotesCard, QuickMemoCard } from "./dashboard/KnowledgeColumn";
import { AddEventModal } from "./dashboard/AddEventModal";

// ---------- ユーティリティ ----------
function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayStr(): string {
  const t = new Date();
  return toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
}

export type Module = "dashboard" | "tasks" | "lists" | "calendar" | "notes" | "recipes" | "finance";

export interface DashboardProps {
  onNavigate?: (module: Module) => void;
  onSelectNote?: (noteId: string) => void;
}

export default function Dashboard({ onNavigate, onSelectNote }: DashboardProps = {}) {
  const today = todayStr();
  const [selectedDate, setSelectedDate] = useState<string>(today);

  // Google カレンダー同期
  const { isSignedIn, accessToken, signIn } = useGoogleAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  // Firestore データ
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pmTemplates, setPmTemplates] = useState<PMTemplateItem[]>([]);
  const [pmSettings, setPmSettings] = useState<PMSettings>(DEFAULT_PM_SETTINGS);

  // モーダルステート
  const [showShiftOverrideModal, setShowShiftOverrideModal] = useState(false);
  const [showAddEventModal, setShowAddEventModal] = useState(false);

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
  }, [isSignedIn, accessToken, getCategoryIcon]);

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

  // ─── Firestore 各種購読 ───
  // events
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "events"), orderBy("createdAt", "asc")), (snap) => {
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CalendarEvent)));
    });
    return unsub;
  }, []);

  // tasks
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

  // notes
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

  // recipes
  useEffect(() => {
    const unsub = subscribeRecipes((fetched) => {
      setRecipes(fetched);
    });
    return () => unsub();
  }, []);

  // pm_templates
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "pm_templates"), (snap) => {
      setPmTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PMTemplateItem)));
    });
    return unsub;
  }, []);

  // shift_settings
  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, "shift_settings", "main"), (snap) => {
      if (snap?.exists?.()) {
        setPmSettings(snap.data() as PMSettings);
      } else {
        setPmSettings(DEFAULT_PM_SETTINGS);
      }
    });

    return () => unsubSettings();
  }, [today]);

  // シフト判定（オーバーライド優先）
  const currentShift = resolveShiftInfo(today, events, pmSettings);

  // 4勤2休サイクル（6日間）の計算
  const cycleRange = useMemo(() => {
    return calculateFourTwoCycleRange(today, events, pmSettings);
  }, [today, events, pmSettings]);

  // タスク完了トグル
  const toggleTask = useCallback(async (id: string, current: boolean) => {
    try {
      await updateDoc(doc(db, "tasks", id), { completed: !current });
    } catch (err) {
      console.error("Failed to toggle task:", err);
    }
  }, []);

  // タスクのクイック追加
  const handleAddTask = useCallback(
    async (title: string, listId?: string, dueDate?: string) => {
      try {
        await addDoc(collection(db, "tasks"), {
          title,
          completed: false,
          dueDate: dueDate || today,
          listId: listId || "default",
          priority: "medium",
          createdAt: serverTimestamp(),
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("Failed to quick-add task:", err);
      }
    },
    [today]
  );

  // 予定の直接追加（Googleカレンダー連動付き）
  const handleAddEvent = useCallback(
    async (data: {
      title: string;
      date: string;
      startTime: string;
      endTime: string;
      note: string;
    }) => {
      let googleEventId: string | undefined;
      if (isSignedIn && accessToken) {
        try {
          googleEventId = await createGoogleCalendarEvent(accessToken, data);
        } catch (gErr) {
          console.error("Failed to push event to Google Calendar:", gErr);
        }
      }

      await addDoc(collection(db, "events"), {
        ...data,
        googleEventId: googleEventId || null,
        createdAt: serverTimestamp(),
      });
    },
    [isSignedIn, accessToken]
  );

  // 手動オーバーライド保存ハンドラ（楽観的即時反映）
  const handleSaveShiftOverride = useCallback(
    async (override: any) => {
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

      try {
        await saveShiftOverride(today, override);
      } catch (err) {
        console.error("Failed to save shift override:", err);
      }
    },
    [today]
  );

  // 日付の和風フォーマット（例「9月13日(日)」）
  const displayFullDate = new Date().toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div className="w-full max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 min-h-screen box-border flex flex-col">
      {/* ─── 最上部ヘッダー: 日付 & 出勤ステータスバッジ ─── */}
      <div className="flex items-center justify-between mb-5 px-1 flex-wrap gap-3">
        <div>
          <p className="text-[0.68rem] font-bold tracking-widest text-charcoal-light uppercase m-0">
            COCKPIT
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-charcoal m-0 tracking-tight">
            ダッシュボード
          </h1>
        </div>

        {/* 日付・勤務ステータス表示（視認性を高めた一回り大きいサイズ） */}
        <div className="flex items-center gap-3.5 flex-wrap">
          <span className="text-xl sm:text-2xl font-bold text-charcoal tracking-tight">
            {displayFullDate}
          </span>
          <ShiftBadge
            shift={currentShift}
            onClick={() => setShowShiftOverrideModal(true)}
            testId="dashboard-shift-badge"
            size="md"
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

      {/* 予定追加ポップアップモーダル */}
      <AddEventModal
        isOpen={showAddEventModal}
        initialDate={selectedDate || today}
        onClose={() => setShowAddEventModal(false)}
        onAdd={handleAddEvent}
      />

      {/* ─── 4勤2休 サイクル・リボン (Cycle Ribbon) ─── */}
      <CycleRibbon
        cycleRange={cycleRange}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        pmTemplates={pmTemplates}
        events={events}
        settings={pmSettings}
        onOpenShiftModal={() => setShowShiftOverrideModal(true)}
      />

      {/* ─── 3×2 均等グリッド構成 (PC: 3列2行 / タブレット: 2列 / モバイル: 1列) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 lg:grid-rows-[210px_240px] gap-5 items-stretch flex-1">
        {/* 【上段 1: 今サイクルの予定 (210px)】 */}
        <CycleEventsCard
          cycleRange={cycleRange}
          events={events}
          onNavigate={onNavigate}
          onAddEvent={() => setShowAddEventModal(true)}
        />

        {/* 【上段 2: 今サイクルの献立 (210px)】 */}
        <CycleMenuCard
          recipes={recipes}
          onNavigate={onNavigate}
        />

        {/* 【上段 3: 最近のノート (210px)】 */}
        <RecentNotesCard
          notes={notes}
          onNavigate={onNavigate}
          onSelectNote={onSelectNote}
        />

        {/* 【下段 1: 期限の近いタスク (240px)】 */}
        <UpcomingTasksCard
          cycleRange={cycleRange}
          tasks={tasks}
          taskLists={categories}
          selectedDate={selectedDate}
          onToggleTask={toggleTask}
          onAddTask={handleAddTask}
          onNavigate={onNavigate}
        />

        {/* 【下段 2: 買い物リスト (240px)】 */}
        <ShoppingListCard
          tasks={tasks}
          onToggleTask={toggleTask}
          onAddTask={handleAddTask}
          onNavigate={onNavigate}
        />

        {/* 【下段 3: クイックメモ (240px)】 */}
        <QuickMemoCard />
      </div>
    </div>
  );
}
