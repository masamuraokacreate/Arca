/**
 * src/types/scheduleApi.ts
 * Arca — 外部連携用スケジュール・次回休日API型定義
 */

/** 休日ブロック情報 */
export interface HolidayBlock {
  /** 休日ブロック開始日 "YYYY-MM-DD" */
  start: string;
  /** 休日ブロック終了日 "YYYY-MM-DD" */
  end: string;
  /** 日付文字列リスト ["MM/DD", "MM/DD", ...] */
  dates: string[];
}

/** 次回休日取得APIレスポンス (GET /api/v1/schedule/next-holidays) */
export interface NextHolidaysResponse {
  /** 現在進行中または直近の休日ブロック */
  current_or_next_block: HolidayBlock;
  /** その次の休日ブロック */
  following_block: HolidayBlock;
}
