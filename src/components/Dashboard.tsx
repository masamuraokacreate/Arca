/**
 * src/components/Dashboard.tsx
 * Arca — 今日フォーカス型 4勤2休サイクルボード ＆ サブグリッド ダッシュボード
 *
 * 設計方針 (Core/Rules.md):
 *  - 4勤2休（出勤4日＋休日2日）に完全同期した司令塔
 *  - 画面左右およびセクション間に上品なベース余白（max-w-[1360px] px-6 sm:px-10 py-8, mb-7〜mb-8）
 *  - タイトル直上に「今日フォーカス型 サイクルボード（アコーディオンFlex構造）」
 *    - 天気情報を完全排除し、生活リズムと行動の連動に特化
 *    - フォーカス日横に前日・翌日の「＜」「＞」切替ボタンを配置
 *  - 下段に重要度・役割に応じた差別化「サブグリッド（1.5fr : 1fr : 1.2fr）」
 *    - 1.5fr: 今サイクルの献立 ＆ 買い物
 *    - 1fr: 最近のノート
 *    - 1.2fr: クイックメモ (Scratchpad)
 *  - 英字キッカー（COCKPIT等）の完全撤廃
 *  - 絵文字完全排除（Lucide React SVGアイコンのみ）
 *  - 境界線排除、微細多層シャドウ、Apple HIG準拠の余白とタイポグラフィ
 *  - iOS実機（375px〜390px）横ブレ完全防止（appearance-none, overflow-x-hidden）
 */

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "../lib/firebase";
import type { CalendarEvent, TaskItem, NoteItem, SyncStatus } from "../types";
import type { PMSettings } from "../types/pm";
import type { Recipe } from "../types/recipe";
import { subscribeRecipes } from "../lib/recipeStorage";
import {
  resolveShiftInfo,
  saveShiftOverride,
  DEFAULT_PM_SETTINGS,
  calculateFourTwoCycleRange,
  getCycleDateRangeLabel,
  getAdjacentCycleAnchor,
} from "../services/pmCycleService";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import {
  syncGoogleCalendarToArca,
  createGoogleCalendarEvent,
} from "../services/googleCalendarSync";
import { ShiftOverrideModal } from "./calendar/ShiftOverrideModal";
import { ShiftBadge } from "./calendar/ShiftBadge";
import { AddEventModal } from "./dashboard/AddEventModal";
import { CycleBoard } from "./dashboard/CycleBoard";
import { SubGrid } from "./dashboard/SubGrid";

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
  const [cycleAnchorDate, setCycleAnchorDate] = useState<string>(today);
  const [selectedDate, setSelectedDate] = useState<string>(today);

  // Google カレンダー同期
  const { isSignedIn, accessToken, signIn } = useGoogleAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  // Firestore データ
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pmSettings, setPmSettings] = useState<PMSettings>(DEFAULT_PM_SETTINGS);

  // モーダルステート
  const [showShiftOverrideModal, setShowShiftOverrideModal] = useState(false);
  const [showAddEventModal, setShowAddEventModal] = useState(false);

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
    return calculateFourTwoCycleRange(cycleAnchorDate, events, pmSettings);
  }, [cycleAnchorDate, events, pmSettings]);

  // サイクル日付範囲ラベル (MM/DD〜MM/DD)
  const cycleDateRangeLabel = useMemo(() => {
    return getCycleDateRangeLabel(cycleRange);
  }, [cycleRange]);

  // サイクル切り替えハンドラ (6日単位)
  const handlePrevCycle = useCallback(() => {
    setCycleAnchorDate((prev) => getAdjacentCycleAnchor(prev, -1));
  }, []);

  const handleNextCycle = useCallback(() => {
    setCycleAnchorDate((prev) => getAdjacentCycleAnchor(prev, 1));
  }, []);

  // サイクル変更時に selectedDate がそのサイクルに含まれない場合はサイクルの開始日を選択
  useEffect(() => {
    const isInCycle = cycleRange.days.some((d) => d.date === selectedDate);
    if (!isInCycle && cycleRange.days.length > 0) {
      const todayInCycle = cycleRange.days.find((d) => d.date === today);
      setSelectedDate(todayInCycle ? today : cycleRange.days[0].date);
    }
  }, [cycleRange, selectedDate, today]);

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

  return (
    <div className="w-full max-w-[1140px] mx-auto px-4 sm:px-8 lg:px-12 py-8 min-h-screen box-border flex flex-col overflow-x-hidden">
      {/* ─── ヘッダー ＆ サイクルナビゲーション（英字キッカー完全撤廃） ─── */}
      <div className="flex items-center justify-between mb-7 px-1 flex-wrap gap-3">
        <div className="flex items-center gap-3.5 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-800 dark:text-stone-100 m-0 tracking-tight">
            ダッシュボード
          </h1>
          <ShiftBadge
            shift={currentShift}
            onClick={() => setShowShiftOverrideModal(true)}
            testId="dashboard-shift-badge"
            size="md"
          />
        </div>

        {/* 中央〜右側: サイクル切り替え ＆ シフト調整ボタン */}
        <div className="flex items-center gap-2.5 sm:gap-4 flex-wrap">
          {/* サイクル切り替えボタン（左側に独立配置） */}
          <div className="flex items-center gap-0.5 bg-white dark:bg-stone-900 rounded-xl p-1 shadow-xs border-none">
            <button
              type="button"
              aria-label="前のサイクル"
              onClick={handlePrevCycle}
              className="appearance-none p-1.5 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer bg-transparent border-none rounded-lg transition-colors"
            >
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              aria-label="次のサイクル"
              onClick={handleNextCycle}
              className="appearance-none p-1.5 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer bg-transparent border-none rounded-lg transition-colors"
            >
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          </div>

          {/* (MM/DD〜MM/DD) のみ表示 ＆ 元のサイズに復元 */}
          <span className="text-xl sm:text-2xl font-bold text-stone-800 dark:text-stone-100 tracking-tight select-none">
            {cycleDateRangeLabel}
          </span>

          {/* シフト調整ボタン */}
          <button
            type="button"
            onClick={() => setShowShiftOverrideModal(true)}
            className="appearance-none text-xs sm:text-sm font-semibold px-3 py-2 rounded-xl bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:text-amber-800 dark:hover:text-amber-300 hover:bg-amber-500/10 shadow-xs cursor-pointer border-none transition-colors"
          >
            シフト調整
          </button>
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

      {/* ─── メイン: 4勤2休 サイクルボード（今日フォーカス型展開アコーディオン） ─── */}
      <CycleBoard
        cycleRange={cycleRange}
        selectedDate={selectedDate}
        today={today}
        onSelectDate={setSelectedDate}
        events={events}
        tasks={tasks}
        onToggleTask={toggleTask}
        onAddTask={handleAddTask}
        onAddEvent={(date) => {
          setSelectedDate(date);
          setShowAddEventModal(true);
        }}
      />

      {/* ─── サブグリッド: 下段3カラム差別化レイアウト (1.5fr : 1fr : 1.2fr) ─── */}
      <SubGrid
        recipes={recipes}
        tasks={tasks}
        notes={notes}
        currentShift={currentShift}
        onNavigate={onNavigate}
        onSelectNote={onSelectNote}
      />
    </div>
  );
}
