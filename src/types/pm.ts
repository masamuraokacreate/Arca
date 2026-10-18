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

/** 実施タイミングカテゴリ種別 */
export type PMTimingCategory =
  | "holiday"       // 休日何日目
  | "early_shift"   // 早番何日目
  | "late_shift"    // 遅番何日目
  | "work_day";     // 出勤何日目

/** PM計画テンプレート（個別タスク） */
export interface PMTemplateItem {
  id: string;
  title: string;             // 例:「風呂場の掃除」「周期洗濯」「シーツ交換」
  content: string;           // 具体的な内容・手順・チェック項目・メモ（広めの記述欄）
  timing?: PMShiftTiming;    // 実施タイミング文字列 (後方互換用、例: "early_shift_1", "rest_day_1")
  timingCategory?: PMTimingCategory; // タイミングカテゴリ (holiday, early_shift, late_shift, work_day)
  timingDay?: number;        // 何日目か (1, 2, 3, 4...)
  cycleInterval?: number;    // サイクル頻度 (1: 毎サイクル, 2: 2サイクルに1回, 3...)
  cycleIntervalOffset?: number; // サイクル開始オフセット (0: グループA/今サイクル, 1: グループB/次サイクル)
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

// ─────────────────────────────────────────
// PM 管理台帳（マスタ） & 実行ログ（新仕様）
// ─────────────────────────────────────────

/** PM周期種別 */
export type PMCycleType =
  | "monthly_day"     // 毎月○日 (cycleValue: 1〜31)
  | "interval_month"  // ○ヶ月ごと (cycleValue: 1, 2, 3...)
  | "annual"          // 年1回 (cycleValue: MMDD または月)
  | "interval_days"   // ○日ごと (cycleValue: 日数)
  | "shift_cycle";    // 出勤・シフト連動 (休日/早番/遅番/出勤の○日目)

/** 次回起算基準 */
export type PMCalcBasis =
  | "fixed_date"       // 予定日基準
  | "completion_date"; // 実績日基準（完了日基準）

/** 購入物テンプレート（台帳側保持） */
export interface PMItemTemplate {
  id: string;
  masterId: string;
  itemName: string;
}

/** 手順マスタ（チェック項目のテンプレート定義） */
export interface PMTaskTemplate {
  id: string;
  masterId: string;
  content: string;
  sortOrder: number;
}

/** PMマスタ（管理台帳定義） */
export interface PMMaster {
  id: string;
  title: string;
  cycleType: PMCycleType;
  cycleValue: number;
  calcBasis: PMCalcBasis;
  // 出勤・シフト連動用フィールド
  timingCategory?: PMTimingCategory; // "holiday" | "early_shift" | "late_shift" | "work_day"
  timingDay?: number;                // 何日目か (1, 2, 3, 4...)
  cycleInterval?: number;            // サイクル頻度 (1: 毎サイクル, 2: 2サイクルに1回/隔週, 3: 3サイクルに1回...)
  cycleIntervalOffset?: number;      // サイクル開始オフセット (0: 今サイクル, 1: 次サイクル)
  estimatedMinutes?: number; // 設定目安工数（分）
  noteId?: string;           // 連携ノートID (Aether Core)
  createdAt: string;         // ISO 8601
  updatedAt: string;         // ISO 8601
  itemTemplates?: PMItemTemplate[];
  taskTemplates?: PMTaskTemplate[];
  nextScheduledDate?: string; // "YYYY-MM-DD" 次回予定日
  lastCompletedAt?: string;   // 最終実施日時
}

/** 次回・次々回予定プレビュー */
export interface PMSchedulePreview {
  nextDate: string;
  nextShiftLabel: string;
  afterNextDate: string;
  afterNextShiftLabel: string;
}

/** 実行ログ（カレンダーで完了した実績データ） */
export interface PMMasterLog {
  id: string;
  masterId: string;
  date?: string;             // "YYYY-MM-DD"
  startedAt?: string | null; // 開始ボタン押下時刻 (時:分まで "HH:mm" または ISO)
  completedAt: string;       // 完了ボタン押下時刻 (時:分まで "HH:mm" または ISO)
  actualMinutes?: number | null; // 実測所要時間（分換算）
  diffMinutes?: number | null;   // 目安との差分 (actual - estimated)
  allTasksCompleted?: boolean;
}
