/**
 * src/types/shift.ts
 * Arca — 勤務シフト（出勤・休日ステータス）型定義モジュール
 *
 * 目的:
 *  - 勤務状態（出勤/休日、連続日数、シフト名、上書き設定）を
 *    定期保全タスク（PM）と明確に分離して定義
 */

// ─────────────────────────────────────────
// シフト種別 & タイミング
// ─────────────────────────────────────────

/** 出勤 ("work") または 休日 ("holiday") */
export type ShiftType = "work" | "holiday";

/** 勤務シフト連動タイミング種別 */
export type ShiftTiming =
  | "rest_day_1"     // 休みの初日（休日1日目）
  | "rest_day_2"     // 休日2日目（連休2日目）
  | "rest_all"       // すべての休日（休みの日ならいつでも）
  | "work_day_1"     // 連勤初日（出勤1日目）
  | "work_last_day"  // 連勤最終日（休日前）
  | "work_all"       // すべての出勤日
  | "interval_days"  // 日数指定（N日ごと）
  | "custom_day";    // サイクル指定（Day 1〜N）

export const SHIFT_TIMING_LABELS: Record<ShiftTiming, string> = {
  rest_day_1: "休みの初日（休日1日目）",
  rest_day_2: "休日2日目（連休2日目）",
  rest_all: "すべての休日",
  work_day_1: "連勤初日（出勤1日目）",
  work_last_day: "連勤最終日（休日前）",
  work_all: "すべての出勤日",
  interval_days: "日数指定（N日ごと）",
  custom_day: "Day番号指定",
};

// ─────────────────────────────────────────
// 日付ごとのシフト情報
// ─────────────────────────────────────────

/** 日付ごとのシフト判定結果 */
export interface ShiftInfo {
  date: string;              // "YYYY-MM-DD"
  type: ShiftType;           // 出勤 ("work") または 休日 ("holiday")
  streakNumber: number;      // 1, 2, 3... 連続何日目か
  shiftName?: string;        // 例: "早番", "遅番", "出勤", "日勤", "当直"
  isOverridden: boolean;     // 手動上書きされたデータかどうか
}

/** 手動シフトオーバーライド設定 */
export interface ShiftOverride {
  date: string;              // "YYYY-MM-DD"
  type: ShiftType;
  streakNumber: number;
  shiftName?: string;
  updatedAt: string;         // ISO 8601
}

/** 日付ごとのシフト詳細情報 */
export interface DateShiftInfo {
  date: string;              // "YYYY-MM-DD"
  isWorkDay: boolean;        // 出勤日か
  isRestDay: boolean;        // 休日（休み）か
  shiftTitle?: string;       // 検出された予定名（例: "日勤", "早番", "夜勤"）
  consecutiveIndex: number;  // 連続何日目か (1-based: 連勤1日目、連休1日目)
  isFirstDayOfStreak: boolean; // 連勤・連休の初日か
  isLastDayOfStreak: boolean;  // 連勤・連休の最終日か
  isOverridden?: boolean;    // 手動上書きされたかどうか
}

/** 勤務シフト全体設定 */
export interface ShiftSettings {
  autoDetectWorkShift?: boolean; // Googleカレンダーからの自動検出有効化 (デフォルト: true)
  overrides?: Record<string, ShiftOverride>; // key: "YYYY-MM-DD"
}
