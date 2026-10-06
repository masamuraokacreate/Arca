/**
 * src/services/scheduleService.ts
 * Arca — 外部連携用スケジュール・次回休日計算サービス
 *
 * 設計思想:
 *  - Arca本体にはDiscord依存の装飾や通知機能を持たせず、純粋なデータ返却ロジックのみを担う
 *  - タイムゾーンに影響されない Date.UTC() ベースの日付演算
 *  - ピュア関数（calculateNextHolidayBlocks）と Firestore連携（fetchNextHolidaysData）を分離
 */

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { CalendarEvent, PMSettings, NextHolidaysResponse, HolidayBlock } from "../types";
import {
  DEFAULT_PM_SETTINGS,
  DEFAULT_CYCLE_LENGTH,
  HOLIDAY_KEYWORDS,
  getShiftSettings,
  getDaysDifference,
  detectAnchorFromEvents,
  isWorkEvent,
  todayDateStr,
} from "./pmCycleService";

// ─────────────────────────────────────────
// 日付演算ユーティリティ
// ─────────────────────────────────────────

/** "YYYY-MM-DD" → UTC エポック日数 */
export function dateStrToEpochDays(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** UTC エポック日数 → "YYYY-MM-DD" */
export function epochDaysToDateStr(epochDays: number): string {
  const d = new Date(epochDays * 86_400_000);
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/** "YYYY-MM-DD" → "MM/DD" */
export function formatDateToMMDD(dateStr: string): string {
  const parts = dateStr.split("-");
  return `${parts[1]}/${parts[2]}`;
}

/**
 * 開始日・終了日から HolidayBlock を生成する
 */
export function buildHolidayBlock(startStr: string, endStr: string): HolidayBlock {
  const startEpoch = dateStrToEpochDays(startStr);
  const endEpoch = dateStrToEpochDays(endStr);
  const dates: string[] = [];

  for (let epoch = startEpoch; epoch <= endEpoch; epoch++) {
    dates.push(formatDateToMMDD(epochDaysToDateStr(epoch)));
  }

  return {
    start: startStr,
    end: endStr,
    dates,
  };
}

/**
 * 指定日が休日かどうかを判定する
 * 1. 手動オーバーライドがあれば最優先
 * 2. その日のカレンダーイベントがあれば、そのイベント（出勤/公休/有休等）に従う
 * 3. その日にイベントがない場合:
 *    手動アンカー日またはカレンダー過去勤務から検出されたアンカー日（またはフォールバック基準日）をもとに、
 *    4勤2休サイクル（Day 1〜4が出勤、Day 5〜6が休日）で循環判定
 */
export function isDateHoliday(
  dateStr: string,
  events: CalendarEvent[],
  settings?: PMSettings | null,
  effectiveAnchorDate?: string
): boolean {
  const safeSettings = settings ?? DEFAULT_PM_SETTINGS;

  // 1. 手動オーバーライドチェック
  const override = safeSettings.overrides?.[dateStr];
  if (override) {
    if ("type" in override && override.type) {
      return override.type === "holiday";
    }
    if ("isRestDay" in override && override.isRestDay) {
      return true;
    }
    if ("overrideDayIndex" in override && override.overrideDayIndex != null) {
      return false;
    }
  }

  // 2. その日のカレンダーイベントチェック
  const dayEvents = events.filter((e) => e.date === dateStr);
  if (dayEvents.length > 0) {
    const workEvent = dayEvents.find((e) => isWorkEvent(e.title));
    if (workEvent) return false;

    const holidayEvent = dayEvents.find((e) => HOLIDAY_KEYWORDS.test(e.title));
    if (holidayEvent) return true;
  }

  // 3. イベントがない日のフォールバック: 4勤2休サイクルによる循環判定
  const anchorDate = effectiveAnchorDate ?? safeSettings.manualAnchorDate ?? dateStr;
  const cycleLen = safeSettings.cycleLength || DEFAULT_CYCLE_LENGTH;
  const anchorDay = safeSettings.manualAnchorDay || 1;

  const diffDays = getDaysDifference(anchorDate, dateStr);
  const dayIndex = (((anchorDay - 1 + diffDays) % cycleLen) + cycleLen) % cycleLen + 1;

  const workDaysInCycle = Math.max(1, cycleLen - 2); // 4勤2休なら4
  return dayIndex > workDaysInCycle;
}

// ─────────────────────────────────────────
// コア計算ロジック（ピュア関数）
// ─────────────────────────────────────────

/**
 * 基準日・予定一覧・シフト設定から、直近2回分の休日ブロックを計算して返却する
 *
 * @param referenceDate 基準日 "YYYY-MM-DD"（未指定時は今日）
 * @param events カレンダー予定一覧
 * @param settings 勤務シフト設定（未指定時はデフォルト）
 * @param fallbackAnchor 起点日未設定時のフォールバックアンカー日
 * @returns 直近2回分の休日ブロック（current_or_next_block, following_block）
 */
export function calculateNextHolidayBlocks(
  referenceDate?: string,
  events: CalendarEvent[] = [],
  settings?: PMSettings | null,
  fallbackAnchor?: string
): NextHolidaysResponse {
  const safeSettings = settings ?? DEFAULT_PM_SETTINGS;
  const refDate = referenceDate ?? todayDateStr();
  const refEpoch = dateStrToEpochDays(refDate);

  // イベントから起点アンカー日を自動検出、または設定、なければフォールバック（基準日）
  const detectedAnchor = events.length > 0
    ? detectAnchorFromEvents(events, refDate)?.anchorDate
    : undefined;
  const effectiveAnchor = safeSettings.manualAnchorDate ?? detectedAnchor ?? fallbackAnchor ?? refDate;

  const checkHoliday = (d: string) => isDateHoliday(d, events, safeSettings, effectiveAnchor);

  const isTodayHoliday = checkHoliday(refDate);

  let currentBlockStartEpoch: number;
  let currentBlockEndEpoch: number;

  if (isTodayHoliday) {
    // 基準日自体が休日ブロックに含まれる場合（連休中）
    // 1. 過去方向へ連続休日の初日を探索（安全上限30日）
    let startEpoch = refEpoch;
    for (let i = 0; i < 30; i++) {
      const prevDateStr = epochDaysToDateStr(startEpoch - 1);
      if (checkHoliday(prevDateStr)) {
        startEpoch--;
      } else {
        break;
      }
    }

    // 2. 未来方向へ連続休日の最終日を探索（安全上限30日）
    let endEpoch = refEpoch;
    for (let i = 0; i < 30; i++) {
      const nextDateStr = epochDaysToDateStr(endEpoch + 1);
      if (checkHoliday(nextDateStr)) {
        endEpoch++;
      } else {
        break;
      }
    }

    currentBlockStartEpoch = startEpoch;
    currentBlockEndEpoch = endEpoch;
  } else {
    // 基準日が出勤日（仕事）の場合: 今日以降で最も早く訪れる休日ブロックを探索
    let cursor = refEpoch;
    const maxSearchDays = 90;

    // 最初の休日開始日を探索
    for (let i = 0; i <= maxSearchDays; i++) {
      const cursorDateStr = epochDaysToDateStr(cursor);
      if (checkHoliday(cursorDateStr)) {
        break;
      }
      cursor++;
    }
    currentBlockStartEpoch = cursor;

    // その休日の連続終了日を探索
    let endEpoch = cursor;
    for (let i = 0; i < 30; i++) {
      const nextDateStr = epochDaysToDateStr(endEpoch + 1);
      if (checkHoliday(nextDateStr)) {
        endEpoch++;
      } else {
        break;
      }
    }
    currentBlockEndEpoch = endEpoch;
  }

  // 次の休日ブロック（following_block）を探索
  // currentBlockEndEpoch の翌日から探索開始
  let followingCursor = currentBlockEndEpoch + 1;
  const maxSearchDaysFollowing = 90;

  for (let i = 0; i <= maxSearchDaysFollowing; i++) {
    const cursorDateStr = epochDaysToDateStr(followingCursor);
    if (checkHoliday(cursorDateStr)) {
      break;
    }
    followingCursor++;
  }
  const followingBlockStartEpoch = followingCursor;

  let followingEndEpoch = followingCursor;
  for (let i = 0; i < 30; i++) {
    const nextDateStr = epochDaysToDateStr(followingEndEpoch + 1);
    if (checkHoliday(nextDateStr)) {
      followingEndEpoch++;
    } else {
      break;
    }
  }

  return {
    current_or_next_block: buildHolidayBlock(
      epochDaysToDateStr(currentBlockStartEpoch),
      epochDaysToDateStr(currentBlockEndEpoch)
    ),
    following_block: buildHolidayBlock(
      epochDaysToDateStr(followingBlockStartEpoch),
      epochDaysToDateStr(followingEndEpoch)
    ),
  };
}

// ─────────────────────────────────────────
// Firestore 連携関数
// ─────────────────────────────────────────

/**
 * Firestoreから勤務設定およびカレンダーイベントを読み込み、直近の休日ブロックを返却する
 *
 * @param referenceDate 基準日 "YYYY-MM-DD"（未指定時は今日）
 * @param anchorDate オプションの起点日 "YYYY-MM-DD"
 */
export async function fetchNextHolidaysData(
  referenceDate?: string,
  anchorDate?: string
): Promise<NextHolidaysResponse> {
  const refDate = referenceDate ?? todayDateStr();
  let settings: PMSettings = DEFAULT_PM_SETTINGS;
  let events: CalendarEvent[] = [];

  try {
    settings = await getShiftSettings();
  } catch (err) {
    console.warn("[scheduleService] Failed to load shift settings, using defaults:", err);
  }

  try {
    // 基準日の前後90日のイベントを取得
    const refEpoch = dateStrToEpochDays(refDate);
    const minDate = epochDaysToDateStr(refEpoch - 30);
    const maxDate = epochDaysToDateStr(refEpoch + 90);

    const q = query(
      collection(db, "events"),
      where("date", ">=", minDate),
      where("date", "<=", maxDate)
    );
    const snap = await getDocs(q);
    events = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CalendarEvent));
  } catch (err) {
    console.warn("[scheduleService] Failed to load calendar events, calculating with settings only:", err);
  }

  return calculateNextHolidayBlocks(refDate, events, settings, anchorDate);
}
