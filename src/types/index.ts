/**
 * src/types/index.ts
 * Arca — 型定義の集約ファイル (Sprint 3 リファクタリング)
 *
 * すべてのモジュールで使用するデータ型をここで定義し、
 * 各コンポーネントはこのファイルからインポートする。
 */

import type { Timestamp } from "firebase/firestore";

// ─────────────────────────────────────────
// Lists モジュール
// ─────────────────────────────────────────

/** 買い物リストの1アイテム */
export interface ListItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: Timestamp | null;
  googleTaskId?: string;
  /** Aether Core が推論・ユーザーが採用したカテゴリ */
  category?: string;
}

/** Google Tasks 同期状態 */
export type SyncStatus = "idle" | "syncing" | "done" | "error";

/** Aether Core カテゴリ提案の状態機械 */
export type SuggestionState =
  | { phase: "idle" }
  | { phase: "thinking" }
  | { phase: "ready"; category: string }
  | { phase: "accepted"; category: string };

// ─────────────────────────────────────────
// Tasks モジュール
// ─────────────────────────────────────────

/** タスク1件 */
export interface TaskItem {
  id: string;
  title: string;
  /** "YYYY-MM-DD" または null */
  dueDate: string | null;
  completed: boolean;
  createdAt: Timestamp | null;
}

// ─────────────────────────────────────────
// Calendar モジュール
// ─────────────────────────────────────────

/** カレンダー予定1件 */
export interface CalendarEvent {
  id: string;
  title: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" または "" */
  startTime: string;
  /** "HH:MM" または "" */
  endTime: string;
  note: string;
  createdAt: Timestamp | null;
}

/** カレンダービュー上のタスク（tasks コレクション読み取り専用） */
export interface CalendarTask {
  id: string;
  title: string;
  dueDate: string | null;
  completed: boolean;
}

// ─────────────────────────────────────────
// Aether Core
// ─────────────────────────────────────────

/** Aether Core が発行するイベント種別 */
export type AetherEventKind = "category_suggest" | "relation_found";

/** Aether Core イベント */
export interface AetherEvent {
  kind: AetherEventKind;
  payload: string;
  confidence: number; // 0.0 〜 1.0
}

// ─────────────────────────────────────────
// Notes / Knowledge モジュール
// ─────────────────────────────────────────

/** メモ1件（Step 1: ローカルステート用。Step 2でFirestore Timestampに移行予定） */
export interface NoteItem {
  id: string;
  title: string;
  /** Markdownフォーマットの本文 */
  content: string;
  /** タグのリスト（例: ["日記", "アイデア"]） */
  tags: string[];
  /** 作成日時（ISO 8601文字列） */
  createdAt: string;
  /** 最終更新日時（ISO 8601文字列） */
  updatedAt: string;
  /** 論理削除フラグ */
  isDeleted?: boolean;
}
