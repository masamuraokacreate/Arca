/**
 * src/types/pm.ts
 * Arca — PM（PM作業・勤務周期管理）モジュール型定義
 *
 * Sprint 9: 勤務シフト・生活リズムに連動する個別タスク周期管理
 */

import type { Timestamp } from "firebase/firestore";
import type { ShiftTiming, ShiftOverride, DateShiftInfo } from "./shift";

// シフト関連型を re-export
export type { ShiftInfo, ShiftOverride, DateShiftInfo, ShiftTiming, ShiftType, ShiftSettings } from "./shift";

// ─────────────────────────────────────────
// PM シフト連動タイミング種別（後方互換エイリアス）
// ─────────────────────────────────────────

export type PMShiftTiming = ShiftTiming;
export { SHIFT_TIMING_LABELS as PM_TIMING_LABELS } from "./shift";

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
