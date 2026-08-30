/**
 * src/utils/debugLogger.ts
 * Arca — Notes モジュール用 デバッグロガー
 *
 * 開発環境 (import.meta.env.DEV) または window.__ARCA_NOTES_DEBUG__ = true 時に
 * エディタの入力イベントや画像処理を色付きでコンソールに出力します。
 */

declare global {
  interface Window {
    __ARCA_NOTES_DEBUG__?: boolean;
  }
}

/** デバッグ出力が有効かどうかを判定（本番・開発ともにログ無効化） */
export function isNotesDebug(): boolean {
  return false;
}

/** テキスト更新イベントのログ出力 (no-op) */
export function logNoteEdit(_length: number, _changeSummary: string) {}

/** 画像挿入イベントのログ出力 (no-op) */
export function logNoteImage(_id: string, _size: string, _mimeType: string) {}

/** IME合成（日本語入力・変換）状態のログ出力 (no-op) */
export function logNoteIME(_isComposing: boolean, _data?: string) {}
