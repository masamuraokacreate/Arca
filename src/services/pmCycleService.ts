/**
 * src/services/pmCycleService.ts
 * Arca — PM 周期計算・シフト自動検出・Firestore CRUD サービス
 *
 * 設計方針:
 *  - ピュア関数（Section A）と Firestore CRUD（Section B）を明確に分離
 *  - タイムゾーンに影響されない Date.UTC() ベースの日付演算
 *  - 既存コンポーネント（PMSection / Calendar / Dashboard）との後方互換性を維持
 *
 * Sprint 9 Phase 2 フル実装
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { PMSettings, PMTemplateItem, PMLogItem, PMDayOverride, PMDayResolution, DateShiftInfo, ShiftInfo, ShiftOverride } from "../types/pm";
import type { CalendarEvent } from "../types";

// ═══════════════════════════════════════════════════════════
// SECTION A: 定数 & デフォルト
// ═══════════════════════════════════════════════════════════

/** デフォルトサイクル長（日数） */
export const DEFAULT_CYCLE_LENGTH = 6;

/** 勤務系キーワード正規表現（「早番(○時)」「遅番(○時)」「日勤(○時半)」などのフォーマットのみを出勤日として検出） */
export const WORK_SHIFT_KEYWORDS = /早番|遅番|日勤/;

/** 休日系キーワード正規表現（公休、休み、有休、休暇等） */
export const HOLIDAY_KEYWORDS = /公休|休み|休養|有休|有給|休暇|特休|振休|代休|off|holiday/i;

/** デフォルト PM 設定 */
export const DEFAULT_PM_SETTINGS: PMSettings = {
  cycleLength: DEFAULT_CYCLE_LENGTH,
  manualAnchorDay: 1,
  autoDetectWorkShift: true,
};

// ═══════════════════════════════════════════════════════════
// SECTION B: 内部ユーティリティ
// ═══════════════════════════════════════════════════════════

/**
 * "YYYY-MM-DD" → UTC エポック日数（タイムゾーン安全）
 */
function dateStrToEpochDays(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * UTC エポック日数 → "YYYY-MM-DD"
 */
function epochDaysToDateStr(epochDays: number): string {
  const d = new Date(epochDays * 86_400_000);
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Date → "YYYY-MM-DD"（ローカルタイム）
 */
export function dateToStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 今日の "YYYY-MM-DD"（ローカルタイム）
 */
export function todayDateStr(): string {
  return dateToStr(new Date());
}

// ═══════════════════════════════════════════════════════════
// SECTION C: コア日付演算（ピュア関数）
// ═══════════════════════════════════════════════════════════

/**
 * 2つの "YYYY-MM-DD" 文字列の日数差を返す（targetDate - anchorDate）
 * Date.UTC() を使用してタイムゾーンに依存しない計算を保証する
 *
 * @example
 *   getDaysDifference("2026-01-01", "2026-01-06") → 5
 *   getDaysDifference("2026-01-06", "2026-01-01") → -5
 */
export function getDaysDifference(anchorDate: string, targetDate: string): number {
  return dateStrToEpochDays(targetDate) - dateStrToEpochDays(anchorDate);
}

// ─────────────────────────────────────────
// calculateDayIndex の返り値型
// ─────────────────────────────────────────

/** `calculateDayIndex` の返り値 */
export interface CalculatedDayInfo {
  /** 解決された PM Day 番号（1〜cycleLength）。休養日の場合は 0 */
  dayIndex: number;
  /** 使用されたサイクル長 */
  cycleLength: number;
  /** 休養日フラグ */
  isRestDay: boolean;
  /** オーバーライド適用フラグ */
  isOverridden: boolean;
  /** 補足メモ（オーバーライドのノート等） */
  note?: string;
}

/**
 * 指定日の PM Day インデックスを計算する（メイン実装）
 *
 * 優先順位:
 *  1. 単日オーバーライド（settings.overrides?.[targetDate]）
 *  2. manualAnchorDate または detectedAnchorDate による循環計算
 *  3. 起点日未設定時は Day 1 固定
 *
 * 循環計算式（負数でも正確に動作）:
 *   dayIndex = (((anchorDay - 1 + diffDays) % cycleLength) + cycleLength) % cycleLength + 1
 *
 * @param targetDate      対象日 "YYYY-MM-DD"
 * @param settings        PMSettings
 * @param detectedAnchorDate  シフト自動検出で得た起点日（manualAnchorDate がなければ使用）
 */
export function calculateDayIndex(
  targetDate: string,
  settings: PMSettings,
  detectedAnchorDate?: string
): CalculatedDayInfo {
  const cycleLength = settings.cycleLength ?? DEFAULT_CYCLE_LENGTH;

  // ── 1. 単日オーバーライド（最優先） ──
  const override: PMDayOverride | undefined = settings.overrides?.[targetDate];
  if (override) {
    if (override.isRestDay) {
      return {
        dayIndex: 0,
        cycleLength,
        isRestDay: true,
        isOverridden: true,
        note: override.note,
      };
    }
    if (override.overrideDayIndex != null) {
      return {
        dayIndex: override.overrideDayIndex,
        cycleLength,
        isRestDay: false,
        isOverridden: true,
        note: override.note,
      };
    }
  }

  // ── 2. 起点日の決定 ──
  const anchorDate = settings.manualAnchorDate ?? detectedAnchorDate ?? targetDate;
  const anchorDay = settings.manualAnchorDay ?? 1;

  // ── 3. 起点日 === 対象日（または起点日未設定フォールバック） ──
  if (anchorDate === targetDate && !settings.manualAnchorDate && !detectedAnchorDate) {
    return { dayIndex: anchorDay, cycleLength, isRestDay: false, isOverridden: false };
  }

  // ── 4. 循環計算（過去日・未来日を問わず正確） ──
  const diffDays = getDaysDifference(anchorDate, targetDate);
  const dayIndex =
    (((anchorDay - 1 + diffDays) % cycleLength) + cycleLength) % cycleLength + 1;

  return { dayIndex, cycleLength, isRestDay: false, isOverridden: false };
}

// ═══════════════════════════════════════════════════════════
// SECTION D: 後方互換ラッパー（既存コンポーネント向け）
// ═══════════════════════════════════════════════════════════

/**
 * 既存コンポーネント（PMSection / Calendar / Dashboard）が使用する
 * computeDayResolution の互換ラッパー
 */
export function computeDayResolution(
  settings: PMSettings,
  targetDate: string,
  detectedAnchorDate?: string
): PMDayResolution {
  const info = calculateDayIndex(targetDate, settings, detectedAnchorDate);
  return {
    dateStr: targetDate,
    dayIndex: info.dayIndex,
    isRestDay: info.isRestDay,
    isOverridden: info.isOverridden,
  };
}

/** 互換: dayIndex のみを返す */
export function computeDayIndex(settings: PMSettings, targetDate: string): number {
  return calculateDayIndex(targetDate, settings).dayIndex;
}

/** 互換: 指定日のテンプレートを order 順で返す */
export function getDayPMItems(
  settings: PMSettings,
  templates: PMTemplateItem[],
  dateStr?: string
): PMTemplateItem[] {
  const targetDate = dateStr ?? todayDateStr();
  const info = calculateDayIndex(targetDate, settings);
  if (info.isRestDay) return [];
  return templates
    .filter((t) => t.dayIndex === info.dayIndex)
    .sort((a, b) => a.order - b.order);
}

/** 互換: 今日のテンプレートを返す */
export function getTodayPMItems(
  settings: PMSettings,
  templates: PMTemplateItem[]
): PMTemplateItem[] {
  return getDayPMItems(settings, templates, todayDateStr());
}

/** 互換: カレンダー用 date → dayIndex マップ */
export function buildCalendarPMDates(
  settings: PMSettings,
  templates: PMTemplateItem[],
  fromDate: string,
  toDate: string,
  includeRestDays = false
): Map<string, number> {
  const result = new Map<string, number>();
  if (!settings.manualAnchorDate) return result;

  const fromEpoch = dateStrToEpochDays(fromDate);
  const toEpoch = dateStrToEpochDays(toDate);
  const activeDayIndexes = new Set(templates.map((t) => t.dayIndex));

  for (let epoch = fromEpoch; epoch <= toEpoch; epoch++) {
    const dateStr = epochDaysToDateStr(epoch);
    const info = calculateDayIndex(dateStr, settings);

    if (info.isRestDay) {
      if (includeRestDays) result.set(dateStr, 0);
      continue;
    }
    if (activeDayIndexes.has(info.dayIndex)) {
      result.set(dateStr, info.dayIndex);
    }
  }
  return result;
}

/** 互換: ログをテンプレートIDでマップ化 */
export function buildLogMapForDate(
  logs: PMLogItem[],
  dateStr: string
): Map<string, PMLogItem> {
  const map = new Map<string, PMLogItem>();
  for (const log of logs) {
    if (log.date === dateStr) map.set(log.templateId, log);
  }
  return map;
}

/** 互換: テンプレートのログ状態を解決 */
export function resolveItemStatus(
  templateItem: PMTemplateItem,
  logMap: Map<string, PMLogItem>
): "completed" | "skipped" | "pending" {
  return logMap.get(templateItem.id)?.status ?? "pending";
}

// ═══════════════════════════════════════════════════════════
// SECTION E: シフト自動検出（ピュア関数）
// ═══════════════════════════════════════════════════════════

/** シフト自動検出の結果型 */
export interface DetectedShiftResult {
  /** 検出された起点日 "YYYY-MM-DD"（連続勤務の初日） */
  anchorDate: string;
  /** 起点日に該当した予定タイトル */
  matchedEventTitle: string;
  /** 信頼度（高信頼度の場合 "high"） */
  confidence: "high";
}

/** 後方互換: resolveAnchorFromWorkShift 向け互換型 */
export interface WorkShiftAnchor {
  date: string;
  dayIndex: number;
  eventTitle: string;
}

/**
 * Google カレンダー予定からシフト連続勤務の初日（Day 1 起点）を自動検出する。
 */
export function detectAnchorFromEvents(
  events: CalendarEvent[],
  referenceDate?: string
): DetectedShiftResult | null {
  const refDate = referenceDate ?? todayDateStr();
  const refEpoch = dateStrToEpochDays(refDate);

  const workDays = new Map<string, string>();
  for (const event of events) {
    if (WORK_SHIFT_KEYWORDS.test(event.title)) {
      if (!workDays.has(event.date)) {
        workDays.set(event.date, event.title);
      }
    }
  }

  if (workDays.size === 0) return null;

  const candidateDates = Array.from(workDays.keys())
    .filter((d) => dateStrToEpochDays(d) <= refEpoch)
    .sort((a, b) => dateStrToEpochDays(b) - dateStrToEpochDays(a));

  for (const dateStr of candidateDates) {
    const prevDateStr = epochDaysToDateStr(dateStrToEpochDays(dateStr) - 1);
    if (!workDays.has(prevDateStr)) {
      return {
        anchorDate: dateStr,
        matchedEventTitle: workDays.get(dateStr)!,
        confidence: "high",
      };
    }
  }

  const oldestDate = candidateDates[candidateDates.length - 1];
  if (oldestDate) {
    return {
      anchorDate: oldestDate,
      matchedEventTitle: workDays.get(oldestDate)!,
      confidence: "high",
    };
  }

  return null;
}

/**
 * 後方互換: 既存 PMSettingsModal.tsx が呼び出す
 * 「Day N」パターンから起点日を推定する旧ロジック
 */
export function resolveAnchorFromWorkShift(
  calendarEvents: CalendarEvent[]
): WorkShiftAnchor | null {
  const patterns = [
    /[Dd][Aa][Yy]\s*(\d+)/,
    /(\d+)\s*日目/,
    /【Day\s*(\d+)】/,
    /D(\d+)/,
  ];

  let best: WorkShiftAnchor | null = null;
  for (const event of calendarEvents) {
    for (const pattern of patterns) {
      const match = event.title.match(pattern);
      if (match) {
        const dayIndex = parseInt(match[1], 10);
        if (dayIndex < 1) continue;
        if (!best || event.date > best.date) {
          best = { date: event.date, dayIndex, eventTitle: event.title };
        }
        break;
      }
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════
// SECTION E-2: 日別シフト詳細判定 & タイミング別タスク抽出
// ═══════════════════════════════════════════════════════════

/** 特定の日付における勤務/休日ステータスを判定（手動オーバーライド最優先 ➔ 出勤/休日キーワード判定） */
function getDayShiftStatus(
  dateStr: string,
  events: CalendarEvent[],
  settings?: PMSettings | null
): { isWork: boolean; shiftName?: string; isOverridden: boolean; streakOverride?: number } {
  // 1. 手動オーバーライドチェック
  const rawOverride = settings?.overrides?.[dateStr];
  if (rawOverride) {
    if ("type" in rawOverride && rawOverride.type) {
      return {
        isWork: rawOverride.type === "work",
        shiftName: rawOverride.shiftName,
        isOverridden: true,
        streakOverride: rawOverride.streakNumber,
      };
    }
    if (rawOverride.isRestDay) {
      return {
        isWork: false,
        shiftName: rawOverride.note,
        isOverridden: true,
        streakOverride: rawOverride.streakNumber,
      };
    }
    if (rawOverride.type) {
      return {
        isWork: rawOverride.type === "work",
        shiftName: rawOverride.shiftName || rawOverride.note,
        isOverridden: true,
        streakOverride: rawOverride.streakNumber,
      };
    }
  }

  // イベントからの判定
  const dayEvents = events.filter((e) => e.date === dateStr);
  const workEvent = dayEvents.find((e) => WORK_SHIFT_KEYWORDS.test(e.title));
  if (workEvent) {
    return {
      isWork: true,
      shiftName: workEvent.title,
      isOverridden: false,
    };
  }

  const holidayEvent = dayEvents.find((e) => HOLIDAY_KEYWORDS.test(e.title));
  if (holidayEvent) {
    return {
      isWork: false,
      shiftName: holidayEvent.title,
      isOverridden: false,
    };
  }

  return {
    isWork: false,
    shiftName: undefined,
    isOverridden: false,
  };
}

/**
 * 指定日の勤務シフト状態（出勤/休日、連続日数、シフト名）を解決する
 *
 * 優先順位:
 *  1. 手動オーバーライド (settings.overrides[targetDate])
 *  2. カレンダーイベント (events) からの自動判定
 *  3. 連続日数の過去最大30日探索（過去の手動オーバーライド・イベントも正確に加味）
 *
 * @param targetDate 対象日 "YYYY-MM-DD"
 * @param events カレンダーイベント一覧
 * @param settings PMSettings (オーバーライド設定含む)
 */
export function resolveShiftInfo(
  targetDate: string,
  events: CalendarEvent[],
  settings?: PMSettings | null
): ShiftInfo {
  // 1. 対象日のステータス取得（手動オーバーライド最優先）
  const currentStatus = getDayShiftStatus(targetDate, events, settings);

  // 対象日自身が手動オーバーライドされている場合は最優先でそのまま返す
  if (currentStatus.isOverridden) {
    return {
      date: targetDate,
      type: currentStatus.isWork ? "work" : "holiday",
      streakNumber: currentStatus.streakOverride ?? 1,
      shiftName: currentStatus.shiftName,
      isOverridden: true,
    };
  }

  // 2. カレンダー・オーバーライド全体に仕事予定が存在するかチェック
  const hasAnyWork =
    events.some((e) => WORK_SHIFT_KEYWORDS.test(e.title)) ||
    Object.values(settings?.overrides || {}).some((o) => (o as any)?.type === "work");

  // 仕事予定が全期間で0件の場合
  if (!hasAnyWork) {
    if (settings?.manualAnchorDate) {
      const anchorEpoch = dateStrToEpochDays(settings.manualAnchorDate);
      const targetEpoch = dateStrToEpochDays(targetDate);
      const cycleLen = settings.cycleLength || DEFAULT_CYCLE_LENGTH;
      const diff = targetEpoch - anchorEpoch;
      const dayIndex = (((diff % cycleLen) + cycleLen) % cycleLen) + (settings.manualAnchorDay || 1);
      const normDay = ((dayIndex - 1) % cycleLen) + 1;
      return {
        date: targetDate,
        type: "holiday",
        streakNumber: normDay,
        shiftName: undefined,
        isOverridden: false,
      };
    }
    return {
      date: targetDate,
      type: "holiday",
      streakNumber: 1,
      shiftName: undefined,
      isOverridden: false,
    };
  }

  // 3. 自動判定: 連続日数の計算（過去方向へ最大30日探索）
  const targetEpoch = dateStrToEpochDays(targetDate);
  const isWorkDay = currentStatus.isWork;

  let streakCount = 1;
  let cursorEpoch = targetEpoch - 1;
  let foundBoundary = false;

  while (streakCount < 30) {
    const prevDateStr = epochDaysToDateStr(cursorEpoch);
    const prevStatus = getDayShiftStatus(prevDateStr, events, settings);

    if (isWorkDay ? prevStatus.isWork : !prevStatus.isWork) {
      streakCount++;
      cursorEpoch--;
    } else {
      foundBoundary = true;
      break;
    }
  }

  // 過去30日探索しても境界が見つからなかった場合
  if (!foundBoundary && streakCount >= 30) {
    streakCount = 1;
  }

  return {
    date: targetDate,
    type: isWorkDay ? "work" : "holiday",
    streakNumber: streakCount,
    shiftName: currentStatus.shiftName || undefined,
    isOverridden: false,
  };
}

/**
 * 指定日の手動シフトオーバーライドを保存またはリセットする
 *
 * @param date 対象日 "YYYY-MM-DD"
 * @param override オーバーライド設定（null でリセット・自動判定に戻す）
 */
export async function saveShiftOverride(
  date: string,
  override: Omit<ShiftOverride, "date" | "updatedAt"> | null
): Promise<void> {
  const currentSettings = await getPMSettings();
  const overrides = { ...(currentSettings.overrides || {}) };

  if (override === null) {
    delete overrides[date];
  } else {
    overrides[date] = {
      date,
      type: override.type,
      streakNumber: override.streakNumber,
      shiftName: override.shiftName,
      updatedAt: new Date().toISOString(),
    };
  }

  await savePMSettings({ overrides });
}

/**
 * 指定日の勤務シフト状態（DateShiftInfo 形式）を解決する（後方互換対応）
 *
 * @param targetDate 対象日 "YYYY-MM-DD"
 * @param events カレンダーイベント一覧
 * @param settings PMSettings (オーバーライド設定含む)
 */
export function resolveDateShiftInfo(
  targetDate: string,
  events: CalendarEvent[],
  settings?: PMSettings | null
): DateShiftInfo {
  const shift = resolveShiftInfo(targetDate, events, settings);
  const isWorkDay = shift.type === "work";
  const isRestDay = !isWorkDay;

  const targetEpoch = dateStrToEpochDays(targetDate);
  const prevDateStr = epochDaysToDateStr(targetEpoch - 1);
  const nextDateStr = epochDaysToDateStr(targetEpoch + 1);

  const prevShift = resolveShiftInfo(prevDateStr, events, settings);
  const nextShift = resolveShiftInfo(nextDateStr, events, settings);

  const isFirstDayOfStreak = isWorkDay ? prevShift.type !== "work" : prevShift.type !== "holiday";
  const isLastDayOfStreak = isWorkDay ? nextShift.type !== "work" : nextShift.type !== "holiday";

  return {
    date: targetDate,
    isWorkDay,
    isRestDay,
    shiftTitle: shift.shiftName,
    consecutiveIndex: shift.streakNumber,
    isFirstDayOfStreak,
    isLastDayOfStreak,
    isOverridden: shift.isOverridden,
  };
}

/**
 * テンプレートが指定日のシフト条件に合致するか判定
 */
export function isTemplateActiveForDate(
  template: PMTemplateItem,
  shiftInfo: DateShiftInfo,
  targetDate: string,
  settings: PMSettings,
  detectedAnchor?: string
): boolean {
  if (template.enabled === false) return false;

  // 1. timing が明示されている場合
  if (template.timing) {
    switch (template.timing) {
      case "rest_day_1":
        return shiftInfo.isRestDay && shiftInfo.consecutiveIndex === 1;
      case "rest_day_2":
        return shiftInfo.isRestDay && shiftInfo.consecutiveIndex === 2;
      case "rest_all":
        return shiftInfo.isRestDay;
      case "work_day_1":
        return shiftInfo.isWorkDay && shiftInfo.isFirstDayOfStreak;
      case "work_last_day":
        return shiftInfo.isWorkDay && shiftInfo.isLastDayOfStreak;
      case "work_all":
        return shiftInfo.isWorkDay;
      case "interval_days": {
        const interval = template.intervalDays || 7;
        const anchor = settings.manualAnchorDate || detectedAnchor || targetDate;
        const diff = Math.abs(getDaysDifference(anchor, targetDate));
        return diff % interval === 0;
      }
      case "custom_day": {
        if (template.dayIndex == null) return false;
        const dayInfo = calculateDayIndex(targetDate, settings, detectedAnchor);
        return !dayInfo.isRestDay && dayInfo.dayIndex === template.dayIndex;
      }
    }
  }

  // 2. timing 未指定で dayIndex のみある場合（後方互換）
  if (template.dayIndex != null) {
    const dayInfo = calculateDayIndex(targetDate, settings, detectedAnchor);
    return !dayInfo.isRestDay && dayInfo.dayIndex === template.dayIndex;
  }

  return true;
}

/**
 * 指定日の実効PMタスク一覧（シフト連動 or Day番号）を抽出する
 */
export function getActivePMTasksForDate(
  targetDate: string,
  templates: PMTemplateItem[],
  events: CalendarEvent[],
  settings: PMSettings
): PMTemplateItem[] {
  const shiftInfo = resolveDateShiftInfo(targetDate, events, settings);
  const detectedAnchor = detectAnchorFromEvents(events, targetDate)?.anchorDate;

  return templates
    .filter((t) => isTemplateActiveForDate(t, shiftInfo, targetDate, settings, detectedAnchor))
    .sort((a, b) => a.order - b.order);
}

// ═══════════════════════════════════════════════════════════
// SECTION F: デフォルト PM テンプレート
// ═══════════════════════════════════════════════════════════

/**
 * シフト連動・周期対応の推奨 PM タスク一覧を返す
 */
export function getDefaultPMTemplates(): Omit<PMTemplateItem, "id">[] {
  return [
    // 休日1日目（休みの初日）
    { timing: "rest_day_1", dayIndex: 1, title: "浴室・水回り清掃", content: "床・排水口・鏡・シャワーヘッド洗浄 / 洗剤補充確認", order: 0 },
    { timing: "rest_day_1", dayIndex: 1, title: "シーツ・枕カバー交換 & 洗濯", content: "ベッドシーツ・枕カバー洗濯 → 乾燥まで完了させる", order: 1 },
    // 休日2日目（またはすべての休日）
    { timing: "rest_day_2", dayIndex: 2, title: "全室床掃除 & モップがけ", content: "掃除機 → フロアモップ。家具下・カーペット下も確認", order: 0 },
    { timing: "rest_all", dayIndex: 3, title: "キッチン・換気扇油汚れケア", content: "フィルター取り外し→つけ置き洗い / コンロ周り拭き上げ", order: 0 },
    // 連勤初日
    { timing: "work_day_1", dayIndex: 4, title: "デスク周り整理 & PCメンテナンス", content: "ケーブル整頓・モニター拭き・不要ファイル整理", order: 0 },
    // 連勤最終日
    { timing: "work_last_day", dayIndex: 5, title: "消耗品在庫点検 & バックアップ", content: "食料・日用品の在庫確認と補充、Arcaバックアップ確認", order: 0 },
  ];
}

/**
 * Firestore `pm_templates` が空の場合のみデフォルトを投入する
 * @returns 投入後の PMTemplateItem[]
 */
export async function seedDefaultPMTemplatesIfEmpty(): Promise<PMTemplateItem[]> {
  const snap = await getDocs(collection(db, "pm_templates"));

  if (!snap.empty) {
    // 既にテンプレートが存在する場合はそのまま返す
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PMTemplateItem));
  }

  const defaults = getDefaultPMTemplates();
  const inserted: PMTemplateItem[] = [];

  for (const template of defaults) {
    const ref = await addDoc(collection(db, "pm_templates"), {
      ...template,
      createdAt: serverTimestamp(),
    });
    inserted.push({ id: ref.id, ...template });
  }

  return inserted;
}

// ═══════════════════════════════════════════════════════════
// SECTION G: Firestore CRUD
// ═══════════════════════════════════════════════════════════

// ─────────────────────────────────────────
// PM 設定
// ─────────────────────────────────────────

const PM_SETTINGS_COL = "pm_settings";
export const PM_SETTINGS_DOC_ID = "main";
const LOCAL_STORAGE_PM_SETTINGS_KEY = "arca_pm_settings";

/** Firestore から PM 設定を取得する（main なければ config / localStorage から取得、存在しない場合はデフォルトを返す） */
export async function getPMSettings(): Promise<PMSettings> {
  try {
    const snap = await getDoc(doc(db, PM_SETTINGS_COL, PM_SETTINGS_DOC_ID));
    if (snap.exists()) {
      const data = snap.data() as PMSettings;
      try {
        localStorage.setItem(LOCAL_STORAGE_PM_SETTINGS_KEY, JSON.stringify(data));
      } catch {}
      return data;
    }
    // 後方互換: 旧 config ドキュメントからのフォールバック
    const configSnap = await getDoc(doc(db, PM_SETTINGS_COL, "config"));
    if (configSnap.exists()) {
      const data = configSnap.data() as PMSettings;
      try {
        localStorage.setItem(LOCAL_STORAGE_PM_SETTINGS_KEY, JSON.stringify(data));
      } catch {}
      return data;
    }
  } catch {
    // Firestore エラー時は localStorage からフォールバック取得
  }

  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_PM_SETTINGS_KEY);
    if (cached) return JSON.parse(cached) as PMSettings;
  } catch {}

  return { ...DEFAULT_PM_SETTINGS };
}

/**
 * PM 設定を Firestore に保存する（部分更新・マージ & localStorage ローカルファースト即時反映）
 * @param settings 更新したいフィールドのみ渡す（Partial）
 */
export async function savePMSettings(settings: Partial<PMSettings>): Promise<void> {
  const existing = await getPMSettings();
  const merged: PMSettings = { ...existing, ...settings };

  // 即座に localStorage へ保存（ローカルファースト）
  try {
    localStorage.setItem(LOCAL_STORAGE_PM_SETTINGS_KEY, JSON.stringify(merged));
  } catch {}

  await setDoc(doc(db, PM_SETTINGS_COL, PM_SETTINGS_DOC_ID), merged);
}

// ─────────────────────────────────────────
// PM テンプレート
// ─────────────────────────────────────────

const PM_TEMPLATES_COL = "pm_templates";

/** すべての PM テンプレートを取得する（dayIndex → order 順） */
export async function getPMTemplates(): Promise<PMTemplateItem[]> {
  const snap = await getDocs(
    query(collection(db, PM_TEMPLATES_COL), orderBy("dayIndex", "asc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PMTemplateItem));
}

/**
 * PM テンプレートを保存する
 * - id が未指定（新規作成）: addDoc
 * - id が指定済み（更新）: setDoc（merge）
 */
export async function savePMTemplate(
  item: Omit<PMTemplateItem, "id"> & { id?: string }
): Promise<PMTemplateItem> {
  if (item.id) {
    // 更新
    const { id, ...data } = item;
    await setDoc(doc(db, PM_TEMPLATES_COL, id), data, { merge: true });
    return { id, ...data } as PMTemplateItem;
  } else {
    // 新規作成
    const { id: _id, ...data } = { id: undefined, ...item };
    const ref = await addDoc(collection(db, PM_TEMPLATES_COL), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return { id: ref.id, ...data } as PMTemplateItem;
  }
}

/** PM テンプレートを削除する */
export async function deletePMTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, PM_TEMPLATES_COL, id));
}

// ─────────────────────────────────────────
// PM ログ
// ─────────────────────────────────────────

const PM_LOGS_COL = "pm_logs";

/** 指定日の PM ログ一覧を取得する */
export async function getPMLogsForDate(date: string): Promise<PMLogItem[]> {
  const snap = await getDocs(
    query(collection(db, PM_LOGS_COL), where("date", "==", date))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PMLogItem));
}

/** PM ログ記録パラメータ */
export interface RecordPMLogParams {
  date: string;
  templateId: string;
  dayIndex: number;
  title: string;
  status: "completed" | "skipped";
  skipReason?: string;
}

/**
 * PM ログを記録する
 * DocID: `${date}_${templateId}` で冪等性を確保（同じ日・同じタスクは上書き）
 */
export async function recordPMLog(params: RecordPMLogParams): Promise<PMLogItem> {
  const docId = `${params.date}_${params.templateId}`;
  const data = {
    ...params,
    completedAt: params.status === "completed" ? new Date().toISOString() : null,
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, PM_LOGS_COL, docId), data, { merge: false });
  return {
    id: docId,
    ...params,
    completedAt: data.completedAt || undefined,
  } as unknown as PMLogItem;
}

// ─────────────────────────────────────────
// 実効タスクマージ
// ─────────────────────────────────────────

/** 実効 PM タスク（テンプレート + ログ状態のマージ結果） */
export interface EffectivePMTask {
  templateId: string;
  title: string;
  content: string;
  order: number;
  dayIndex: number;
  logStatus: "completed" | "skipped" | "pending";
  skipReason?: string;
  completedAt?: string | null;
}

/**
 * 指定日の実効 PM タスク一覧を返す
 *
 * 処理フロー:
 *  1. `calculateDayIndex` で指定日の dayIndex を解決
 *  2. dayIndex に合致するテンプレートを取得
 *  3. 当日のログ（完了/スキップ）をマージ
 *  4. order 順で返す
 *
 * @param date               対象日 "YYYY-MM-DD"
 * @param settings           PMSettings
 * @param detectedAnchorDate シフト自動検出で得た起点日（任意）
 */
export async function getEffectivePMTasksForDate(
  date: string,
  settings: PMSettings,
  detectedAnchorDate?: string
): Promise<EffectivePMTask[]> {
  const dayInfo = calculateDayIndex(date, settings, detectedAnchorDate);

  // 休養日はタスクなし
  if (dayInfo.isRestDay) return [];

  // テンプレート・ログを並列取得
  const [templates, logs] = await Promise.all([
    getPMTemplates(),
    getPMLogsForDate(date),
  ]);

  // 当日の dayIndex に合致するテンプレートを抽出
  const dayTemplates = templates
    .filter((t) => t.dayIndex === dayInfo.dayIndex)
    .sort((a, b) => a.order - b.order);

  // ログをテンプレートIDでマップ化
  const logMap = new Map<string, PMLogItem>();
  for (const log of logs) {
    logMap.set(log.templateId, log);
  }

  // マージ
  return dayTemplates.map((t): EffectivePMTask => {
    const log = logMap.get(t.id);
    return {
      templateId: t.id,
      title: t.title,
      content: t.content,
      order: t.order,
      dayIndex: t.dayIndex ?? 1,
      logStatus: log?.status ?? "pending",
      skipReason: log?.skipReason,
      completedAt: log?.completedAt ?? null,
    };
  });
}
