/**
 * src/services/pmMasterService.ts
 * Arca — PM（周期保全・管理台帳）マスタ管理 & 実行ログ サービス
 *
 * 設計原則:
 *  - 独立した専用データ構造（pm_masters / pm_logs）
 *  - 予定日基準 (fixed_date) / 完了日基準 (completion_date) に基づく正確な次回予定日計算
 *  - Aether Core 連携（Listsへの購入物ワンタップ追加、Notes参照）
 *  - Apple HIG & Core/Rules.md 準拠、絵文字完全排除
 */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  serverTimestamp,
  addDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type {
  PMMaster,
  PMMasterLog,
  PMCycleType,
  PMCalcBasis,
  PMSchedulePreview,
} from "../types/pm";

// ─────────────────────────────────────────
// 日付計算ユーティリティ
// ─────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayStr(): string {
  return formatDateStr(new Date());
}

import type { CalendarEvent } from "../types";
import { resolveDateShiftInfo, calculateCycleIndex } from "./pmCycleService";
import type { PMSettings, PMTimingCategory } from "../types/pm";

/**
 * 指定日がマスタのシフト連動条件に合致するか判定
 */
export function isMasterShiftTimingMatch(
  targetDate: string,
  master: Pick<PMMaster, "timingCategory" | "timingDay" | "cycleInterval" | "cycleIntervalOffset">,
  events: CalendarEvent[] = [],
  settings?: PMSettings | null
): boolean {
  const timingCategory = master.timingCategory || "holiday";
  const timingDay = master.timingDay || 1;
  const cycleInterval = master.cycleInterval && master.cycleInterval > 1 ? master.cycleInterval : 1;

  // 1. サイクル頻度判定（2サイクルに1回 = 隔週など）
  if (cycleInterval > 1) {
    const cycleIndex = calculateCycleIndex(targetDate, events, settings);
    const offset = master.cycleIntervalOffset || 0;
    const mod = (((cycleIndex - offset) % cycleInterval) + cycleInterval) % cycleInterval;
    if (mod !== 0) return false;
  }

  // 2. シフト判定
  const shiftInfo = resolveDateShiftInfo(targetDate, events, settings);
  switch (timingCategory) {
    case "holiday":
      return shiftInfo.isRestDay && shiftInfo.consecutiveIndex === timingDay;
    case "early_shift":
      return shiftInfo.isWorkDay && Boolean(shiftInfo.isEarlyShift) && shiftInfo.earlyStreakIndex === timingDay;
    case "late_shift":
      return shiftInfo.isWorkDay && Boolean(shiftInfo.isLateShift) && shiftInfo.lateStreakIndex === timingDay;
    case "work_day":
      return shiftInfo.isWorkDay && shiftInfo.consecutiveIndex === timingDay;
    default:
      return false;
  }
}

/**
 * PMマスタの次回予定日を計算する
 * @param master PMマスタ定義
 * @param fromDate 計算の基準日（省略時は今日または前回の予定日/完了日）
 * @param events カレンダーイベント一覧（シフト計算用）
 * @param settings PM/シフト設定
 */
export function calculateNextScheduledDate(
  master: Pick<
    PMMaster,
    | "cycleType"
    | "cycleValue"
    | "calcBasis"
    | "lastCompletedAt"
    | "nextScheduledDate"
    | "timingCategory"
    | "timingDay"
    | "cycleInterval"
    | "cycleIntervalOffset"
  >,
  fromDate?: string,
  events: CalendarEvent[] = [],
  settings?: PMSettings | null
): string {
  const today = todayStr();
  
  // 基準日を特定
  let baseDateStr = fromDate;
  if (!baseDateStr) {
    if (master.calcBasis === "completion_date" && master.lastCompletedAt) {
      baseDateStr = master.lastCompletedAt.slice(0, 10);
    } else if (master.calcBasis === "fixed_date" && master.nextScheduledDate) {
      baseDateStr = master.nextScheduledDate;
    } else {
      baseDateStr = today;
    }
  }

  const [by, bm, bd] = baseDateStr.split("-").map(Number);
  const base = new Date(by, bm - 1, bd);

  let nextDate: Date;

  switch (master.cycleType) {
    case "shift_cycle": {
      // 出勤・シフト連動: baseDateStr の翌日（今日より前なら今日）から最大90日間探索
      const baseEpoch = Math.floor(Date.UTC(by, bm - 1, bd) / 86400000);
      const now = new Date();
      const todayEpoch = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
      const startEpoch = Math.max(baseEpoch + 1, todayEpoch);
      for (let i = 0; i < 90; i++) {
        const d = new Date((startEpoch + i) * 86400000);
        const candidateStr = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
        if (isMasterShiftTimingMatch(candidateStr, master, events, settings)) {
          return candidateStr;
        }
      }
      // 見つからない場合のフォールバック（7日後）
      nextDate = new Date(base.getTime() + 7 * 86_400_000);
      break;
    }

    case "monthly_day": {
      // 毎月○日
      const targetDay = Math.min(Math.max(master.cycleValue || 1, 1), 31);
      // 今月のtargetDay
      let candidate = new Date(base.getFullYear(), base.getMonth(), targetDay);
      // 月末日の調整（例: 2月30日→2月28/29日）
      if (candidate.getMonth() !== base.getMonth()) {
        candidate = new Date(base.getFullYear(), base.getMonth() + 1, 0);
      }
      // もし基準日以降でない（同日または過去）なら翌月
      if (formatDateStr(candidate) <= baseDateStr) {
        candidate = new Date(base.getFullYear(), base.getMonth() + 1, targetDay);
        if (candidate.getMonth() !== (base.getMonth() + 1) % 12) {
          candidate = new Date(base.getFullYear(), base.getMonth() + 2, 0);
        }
      }
      nextDate = candidate;
      break;
    }

    case "interval_month": {
      // ○ヶ月ごと
      const months = Math.max(master.cycleValue || 1, 1);
      nextDate = new Date(base.getFullYear(), base.getMonth() + months, bd);
      break;
    }

    case "annual": {
      // 年1回（12ヶ月後）
      nextDate = new Date(base.getFullYear() + 1, base.getMonth(), bd);
      break;
    }

    case "interval_days":
    default: {
      // ○日ごと
      const days = Math.max(master.cycleValue || 30, 1);
      nextDate = new Date(base.getTime() + days * 86_400_000);
      break;
    }
  }

  return formatDateStr(nextDate);
}

/**
 * 日付の4勤2休シフト種別（休1、休2、勤1、早1、遅1など）の短縮ラベルを生成する純粋関数
 */
export function getShiftShortLabel(
  targetDate: string,
  events: CalendarEvent[] = [],
  settings?: PMSettings | null
): string {
  const info = resolveDateShiftInfo(targetDate, events, settings);
  if (info.isRestDay) {
    return `休${info.consecutiveIndex || 1}`;
  }
  if (info.isEarlyShift) {
    return `早${info.earlyStreakIndex || info.consecutiveIndex || 1}`;
  }
  if (info.isLateShift) {
    return `遅${info.lateStreakIndex || info.consecutiveIndex || 1}`;
  }
  return `勤${info.consecutiveIndex || 1}`;
}

/**
 * 起算日と周期設定から次回・次々回の予定日およびシフト情報を算出する純粋関数
 */
export function calculateFuturePMSchedules(
  baseDate: string,
  master: Pick<
    PMMaster,
    | "cycleType"
    | "cycleValue"
    | "calcBasis"
    | "timingCategory"
    | "timingDay"
    | "cycleInterval"
    | "cycleIntervalOffset"
  >,
  events: CalendarEvent[] = [],
  settings?: PMSettings | null
): PMSchedulePreview {
  // 基準日（今回予定日）が空または無効な場合は直近の次回予定日を算出
  let nextDate = baseDate;
  if (!nextDate || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
    nextDate = calculateNextScheduledDate(master, undefined, events, settings);
  }

  const nextShiftLabel = getShiftShortLabel(nextDate, events, settings);

  // cycleInterval > 1（隔サイクル等）の場合、nextDateのサイクルを起点オフセットとして次サイクル予定日を探索
  const cycleInterval = master.cycleInterval && master.cycleInterval > 1 ? master.cycleInterval : 1;
  let effectiveOffset = master.cycleIntervalOffset;
  if (master.cycleType === "shift_cycle" && cycleInterval > 1) {
    const baseCycle = calculateCycleIndex(nextDate, events, settings);
    effectiveOffset = (((baseCycle % cycleInterval) + cycleInterval) % cycleInterval);
  }

  // 次回予定日（今回予定日から1周期先を算出）
  const afterNextDate = calculateNextScheduledDate(
    {
      ...master,
      calcBasis: "fixed_date",
      nextScheduledDate: nextDate,
      cycleIntervalOffset: effectiveOffset,
    },
    nextDate,
    events,
    settings
  );
  const afterNextShiftLabel = getShiftShortLabel(afterNextDate, events, settings);

  return {
    nextDate,
    nextShiftLabel,
    afterNextDate,
    afterNextShiftLabel,
  };
}

// ─────────────────────────────────────────
// 初期サンプルPMマスタ（初回利用時の支援）
// ─────────────────────────────────────────

export const DEFAULT_PM_MASTERS: Omit<PMMaster, "id" | "createdAt" | "updatedAt">[] = [
  {
    title: "エアコンフィルター清掃",
    cycleType: "monthly_day",
    cycleValue: 25,
    calcBasis: "fixed_date",
    estimatedMinutes: 20,
    itemTemplates: [
      { id: "item-1", masterId: "", itemName: "エアコン用防カビスプレー" },
    ],
    taskTemplates: [
      { id: "task-1", masterId: "", content: "エアコンパネルを開けてフィルターを取り外す", sortOrder: 1 },
      { id: "task-2", masterId: "", content: "掃除機でホコリを吸い取り水洗いする", sortOrder: 2 },
      { id: "task-3", masterId: "", content: "日陰で完全に乾燥させて元に戻す", sortOrder: 3 },
    ],
  },
  {
    title: "洗濯槽クリーナー洗浄",
    cycleType: "interval_month",
    cycleValue: 2,
    calcBasis: "completion_date",
    estimatedMinutes: 45,
    itemTemplates: [
      { id: "item-2", masterId: "", itemName: "酸素系洗濯槽クリーナー" },
    ],
    taskTemplates: [
      { id: "task-4", masterId: "", content: "ぬるま湯を満水にしてクリーナーを投入する", sortOrder: 1 },
      { id: "task-5", masterId: "", content: "標準コースで2〜3分攪拌後、数時間放置する", sortOrder: 2 },
      { id: "task-6", masterId: "", content: "浮き出た汚れを網ですくい取り、すすぎ運転を行う", sortOrder: 3 },
    ],
  },
];

// ─────────────────────────────────────────
// Firestore CRUD 操作
// ─────────────────────────────────────────

const MASTERS_COL = "pm_masters";
const LOGS_COL = "pm_logs";

/**
 * PMマスタ一覧のリアルタイム購読
 */
export function subscribePMMasters(
  callback: (masters: PMMaster[]) => void
): () => void {
  const q = query(collection(db, MASTERS_COL));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: PMMaster[] = [];
      const rawDocs = Array.isArray((snapshot as any)?.docs)
        ? (snapshot as any).docs
        : typeof (snapshot as any)?.forEach === "function"
        ? (() => {
            const arr: any[] = [];
            (snapshot as any).forEach((d: any) => arr.push(d));
            return arr;
          })()
        : [];

      rawDocs.forEach((d: any) => {
        const data = typeof d.data === "function" ? d.data() : d;
        items.push({
          id: d.id,
          title: data.title || "",
          cycleType: (data.cycleType as PMCycleType) || "monthly_day",
          cycleValue: Number(data.cycleValue) || 1,
          calcBasis: (data.calcBasis as PMCalcBasis) || "fixed_date",
          estimatedMinutes: data.estimatedMinutes !== undefined && data.estimatedMinutes !== null ? Number(data.estimatedMinutes) : undefined,
          noteId: data.noteId || undefined,
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
          itemTemplates: Array.isArray(data.itemTemplates) ? data.itemTemplates : [],
          taskTemplates: Array.isArray(data.taskTemplates) ? data.taskTemplates : [],
          nextScheduledDate: data.nextScheduledDate || undefined,
          lastCompletedAt: data.lastCompletedAt || undefined,
          timingCategory: (data.timingCategory as PMTimingCategory) || undefined,
          timingDay: data.timingDay !== undefined && data.timingDay !== null ? Number(data.timingDay) : undefined,
          cycleInterval: data.cycleInterval !== undefined && data.cycleInterval !== null ? Number(data.cycleInterval) : undefined,
          cycleIntervalOffset: data.cycleIntervalOffset !== undefined && data.cycleIntervalOffset !== null ? Number(data.cycleIntervalOffset) : undefined,
        });
      });
      callback(items);
    },
    (err) => {
      console.error("[PMMasterService] subscribe masters error:", err);
      callback([]);
    }
  );
}

/**
 * PMマスタの作成または更新
 */
export async function savePMMaster(
  master: Partial<PMMaster> & { title: string },
  events?: CalendarEvent[],
  settings?: PMSettings | null
): Promise<string> {
  const id = master.id || `pm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  // 次回予定日の初期値または再計算
  let nextDate = master.nextScheduledDate;
  if (!nextDate) {
    nextDate = calculateNextScheduledDate(
      {
        cycleType: master.cycleType || "monthly_day",
        cycleValue: master.cycleValue || 25,
        calcBasis: master.calcBasis || "fixed_date",
        lastCompletedAt: master.lastCompletedAt,
        nextScheduledDate: master.nextScheduledDate,
        timingCategory: master.timingCategory,
        timingDay: master.timingDay,
        cycleInterval: master.cycleInterval,
        cycleIntervalOffset: master.cycleIntervalOffset,
      },
      undefined,
      events,
      settings
    );
  }

  const docData = {
    title: typeof master.title === "string" ? master.title.trim() : "",
    cycleType: master.cycleType || "monthly_day",
    cycleValue: Number(master.cycleValue) || 1,
    calcBasis: master.calcBasis || "fixed_date",
    timingCategory: master.timingCategory || null,
    timingDay: master.timingDay !== undefined && master.timingDay !== null ? Number(master.timingDay) : null,
    cycleInterval: master.cycleInterval !== undefined && master.cycleInterval !== null ? Number(master.cycleInterval) : null,
    cycleIntervalOffset: master.cycleIntervalOffset !== undefined && master.cycleIntervalOffset !== null ? Number(master.cycleIntervalOffset) : null,
    estimatedMinutes: master.estimatedMinutes !== undefined && master.estimatedMinutes !== null ? Number(master.estimatedMinutes) : null,
    noteId: master.noteId || null,
    itemTemplates: (master.itemTemplates || []).map((item, idx) => ({
      id: item.id || `item-${id}-${idx}`,
      masterId: id,
      itemName: item.itemName.trim(),
    })),
    taskTemplates: (master.taskTemplates || []).map((t, idx) => ({
      id: t.id || `task-${id}-${idx}`,
      masterId: id,
      content: t.content.trim(),
      sortOrder: t.sortOrder ?? idx + 1,
    })),
    nextScheduledDate: nextDate,
    lastCompletedAt: master.lastCompletedAt || null,
    updatedAt: now,
    ...(master.createdAt ? { createdAt: master.createdAt } : { createdAt: now }),
  };

  await setDoc(doc(db, MASTERS_COL, id), docData, { merge: true });
  return id;
}

/**
 * PMマスタの削除
 */
export async function deletePMMaster(id: string): Promise<void> {
  await deleteDoc(doc(db, MASTERS_COL, id));
}

/**
 * PM実行ログのリアルタイム購読（特定マスタまたは全件）
 */
export function subscribePMMasterLogs(
  masterId: string | null,
  callback: (logs: PMMasterLog[]) => void
): () => void {
  const baseCol = collection(db, LOGS_COL);
  const q = masterId
    ? query(baseCol, where("masterId", "==", masterId))
    : query(baseCol);

  return onSnapshot(
    q,
    (snapshot) => {
      const logs: PMMasterLog[] = [];
      const rawDocs = Array.isArray((snapshot as any)?.docs)
        ? (snapshot as any).docs
        : typeof (snapshot as any)?.forEach === "function"
        ? (() => {
            const arr: any[] = [];
            (snapshot as any).forEach((d: any) => arr.push(d));
            return arr;
          })()
        : [];

      rawDocs.forEach((d: any) => {
        const data = typeof d.data === "function" ? d.data() : d;
        logs.push({
          id: d.id,
          masterId: data.masterId,
          date: data.date || undefined,
          startedAt: data.startedAt || null,
          completedAt: data.completedAt || new Date().toISOString(),
          actualMinutes: data.actualMinutes !== undefined ? data.actualMinutes : null,
          diffMinutes: data.diffMinutes !== undefined ? data.diffMinutes : null,
          allTasksCompleted: data.allTasksCompleted ?? true,
        });
      });
      // 完了時刻の降順にソート
      logs.sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
      callback(logs);
    },
    (err) => {
      console.error("[PMMasterService] subscribe logs error:", err);
      callback([]);
    }
  );
}

/**
 * PM実行完了時のログ保存とマスタ次回予定日更新
 */
export async function recordPMExecution(params: {
  master: PMMaster;
  startedAt?: string | null;  // "HH:mm" または ISO
  completedAt: string;        // "HH:mm" または ISO
  date?: string;              // "YYYY-MM-DD"
}): Promise<PMMasterLog> {
  const executionDate = params.date || todayStr();
  const logId = `pmlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // 実測工数（分）の計算
  let actualMinutes: number | null = null;
  let diffMinutes: number | null = null;

  if (params.startedAt && params.completedAt) {
    // "HH:mm" 形式か ISO 形式かを判定
    let startMin = 0;
    let endMin = 0;

    if (params.startedAt.includes(":") && params.startedAt.length <= 5) {
      const [sh, sm] = params.startedAt.split(":").map(Number);
      startMin = sh * 60 + sm;
    } else {
      const sd = new Date(params.startedAt);
      startMin = sd.getHours() * 60 + sd.getMinutes();
    }

    if (params.completedAt.includes(":") && params.completedAt.length <= 5) {
      const [eh, em] = params.completedAt.split(":").map(Number);
      endMin = eh * 60 + em;
    } else {
      const ed = new Date(params.completedAt);
      endMin = ed.getHours() * 60 + ed.getMinutes();
    }

    // 日付またぎ考慮（例: 23:50 〜 00:20）
    let diff = endMin - startMin;
    if (diff < 0) diff += 24 * 60;
    actualMinutes = diff;

    if (params.master.estimatedMinutes) {
      diffMinutes = actualMinutes - params.master.estimatedMinutes;
    }
  }

  const logRecord: PMMasterLog = {
    id: logId,
    masterId: params.master.id,
    date: executionDate,
    startedAt: params.startedAt || null,
    completedAt: params.completedAt,
    actualMinutes,
    diffMinutes,
    allTasksCompleted: true,
  };

  // 1. pm_logs へ保存
  await setDoc(doc(db, LOGS_COL, logId), {
    ...logRecord,
    createdAt: serverTimestamp(),
  });

  // 2. 次回予定日の再計算 & pm_masters 更新
  const nextScheduled = calculateNextScheduledDate(
    params.master,
    params.master.calcBasis === "completion_date" ? executionDate : params.master.nextScheduledDate
  );

  await setDoc(
    doc(db, MASTERS_COL, params.master.id),
    {
      lastCompletedAt: new Date().toISOString(),
      nextScheduledDate: nextScheduled,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return logRecord;
}

/**
 * Aether Core 連携: 購入物品を Lists (tasks コレクション) へ即時追加
 */
export async function addItemsToLists(
  itemNames: string[],
  targetListId?: string
): Promise<number> {
  let count = 0;
  for (const name of itemNames) {
    if (!name.trim()) continue;
    await addDoc(collection(db, "tasks"), {
      title: name.trim(),
      completed: false,
      listId: targetListId || "shopping",
      dueDate: null,
      notes: "PM保全用購入物 (Aether Core 自動連携)",
      createdAt: serverTimestamp(),
    });
    count++;
  }
  return count;
}
