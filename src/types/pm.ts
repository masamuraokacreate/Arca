/**
 * src/types/pm.ts
 * Arca — PM（Preventive Maintenance / 予防保全・勤務周期管理）モジュール型定義
 *
 * Sprint 9: 勤務シフト・生活リズムに連動する個別タスク周期管理
 */

import type { Timestamp } from "firebase/firestore";

// ─────────────────────────────────────────
// PM シフト連動タイミング種別
// ─────────────────────────────────────────

export type PMShiftTiming =
  | "rest_day_1"     // 休みの初日（休日1日目）
  | "rest_day_2"     // 休日2日目（連休2日目）
  | "rest_all"       // すべての休日（休みの日ならいつでも）
  | "work_day_1"     // 連勤初日（出勤1日目）
  | "work_last_day"  // 連勤最終日（休日前）
  | "work_all"       // すべての出勤日
  | "interval_days"  // 日数指定（N日ごと）
  | "custom_day";    // サイクル指定（Day 1〜N）

export const PM_TIMING_LABELS: Record<PMShiftTiming, string> = {
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
// 日付ごとのシフト情報（Sprint 9 拡張）
// ─────────────────────────────────────────

/** 日付ごとのシフト判定結果（公式定義） */
export interface ShiftInfo {
  date: string;              // "YYYY-MM-DD"
  type: "work" | "holiday";  // 出勤 ("work") または 休日 ("holiday")
  streakNumber: number;      // 1, 2, 3... 連続何日目か
  shiftName?: string;        // 例: "早番", "遅番", "出勤", "日勤", "当直"
  isOverridden: boolean;     // 手動上書きされたデータかどうか
}

/** 手動オーバーライド用設定（公式定義） */
export interface ShiftOverride {
  date: string;              // "YYYY-MM-DD"
  type: "work" | "holiday";
  streakNumber: number;
  shiftName?: string;
  updatedAt: string;         // ISO 8601
}

/** 日付ごとのシフト情報（後方互換用） */
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

// ─────────────────────────────────────────
// PM テンプレート
// ─────────────────────────────────────────

/** PM計画テンプレート（個別タスク） */
export interface PMTemplateItem {
  id: string;
  title: string;             // 例:「風呂場の掃除」「周期洗濯」「シーツ交換」
  content: string;           // 具体的な内容・手順・チェック項目・メモ（広めの記述欄）
  timing?: PMShiftTiming;    // 実施タイミング（デフォルト: rest_day_1）
  intervalDays?: number;     // interval_days の場合の日数 (例: 7)
  dayIndex?: number;         // 従来のDay番号 (1〜N、custom_day または後方互換用)
  order: number;             // 並び順
  enabled?: boolean;         // 有効/無効（デフォルト: true）
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

// ─────────────────────────────────────────
// PM 実行ログ
// ─────────────────────────────────────────

/** 実施・スキップの実行ログ */
export interface PMLogItem {
  id: string;
  date: string;              // "YYYY-MM-DD"
  templateId: string;
  dayIndex?: number;
  title: string;
  status: "completed" | "skipped" | "pending";
  skipReason?: string;       // 未実施・見送りの理由
  completedAt?: string;      // ISO 8601
  createdAt?: Timestamp | null;
}

// ─────────────────────────────────────────
// PM 日別オーバーライド（後方互換用）
// ─────────────────────────────────────────

/** 単日オーバーライド（特定日だけのDay差し替え・休日扱い等） */
export interface PMDayOverride {
  date: string;              // "YYYY-MM-DD"
  overrideDayIndex?: number; // その日だけ強制適用するDay番号 (1〜N)
  isRestDay?: boolean;       // その日をPM休養日とするフラグ
  note?: string;
  type?: "work" | "holiday";
  streakNumber?: number;
  shiftName?: string;
}

// ─────────────────────────────────────────
// PM 設定
// ─────────────────────────────────────────

/** PMモジュール全体設定 */
export interface PMSettings {
  cycleLength?: number;       // サイクルの総日数 (例: 6, 12, 24など)
  manualAnchorDate?: string;  // "YYYY-MM-DD" (手動起点日)
  manualAnchorDay?: number;   // 起点日におけるDay番号 (デフォルト: 1)
  autoDetectWorkShift?: boolean; // Googleカレンダーからの自動検出有効化 (デフォルト: true)
  overrides?: Record<string, ShiftOverride | PMDayOverride>; // key: "YYYY-MM-DD"
}

// ─────────────────────────────────────────
// PM ユーティリティ型
// ─────────────────────────────────────────

/** 特定日の PM 解決結果 */
export interface PMDayResolution {
  dateStr: string;           // "YYYY-MM-DD"
  dayIndex: number;          // 解決された Day 番号 (1〜N)
  isRestDay: boolean;        // 休養日フラグ
  isOverridden: boolean;     // オーバーライド適用フラグ
  shiftInfo?: DateShiftInfo; // 日付のシフト状態
}

/** 設定モーダルのアクティブタブ */
export type PMSettingsTab = "tasks" | "cycle" | "overrides";
