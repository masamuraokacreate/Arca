/**
 * src/components/dashboard/AddEventModal.tsx
 * Arca — 予定追加ポップアップモーダル（Apple HIG × Arca 準拠）
 *
 * 目的:
 *  - ダッシュボード上でカレンダー画面に遷移せず、直感的に予定を直接追加
 *  - 枠線完全排除、多層シャドウ、洗練されたフォントと余白
 *  - Googleカレンダー連動にも対応
 */

import React, { useState, useEffect, useRef } from "react";
import { X, Calendar as CalendarIcon, Clock, AlignLeft } from "lucide-react";

export interface AddEventModalProps {
  isOpen: boolean;
  initialDate: string; // "YYYY-MM-DD"
  onClose: () => void;
  onAdd: (data: {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    note: string;
  }) => Promise<void> | void;
}

export const AddEventModal: React.FC<AddEventModalProps> = ({
  isOpen,
  initialDate,
  onClose,
  onAdd,
}) => {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate);
  const [isAllDay, setIsAllDay] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);

  // モーダルオープン時の初期化
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDate(initialDate || new Date().toISOString().slice(0, 10));
      setIsAllDay(false);
      setStartTime("");
      setEndTime("");
      setNote("");
      setIsSubmitting(false);

      // フォーカス
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, initialDate]);

  // Escapeキーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onAdd({
        title: trimmedTitle,
        date,
        startTime: isAllDay ? "" : startTime,
        endTime: isAllDay ? "" : endTime,
        note: note.trim(),
      });
      onClose();
    } catch (err) {
      console.error("Failed to add event:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-event-title"
    >
      <div
        className="w-full max-w-md bg-white dark:bg-stone-900 rounded-2xl shadow-2xl p-6 transition-all transform scale-100"
        style={{
          boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.2), 0 0 1px rgba(0, 0, 0, 0.1)",
        }}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between pb-3 border-b border-black/[0.05] dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-800 dark:text-amber-300">
              <CalendarIcon size={18} />
            </div>
            <h2 id="add-event-title" className="text-base font-bold text-charcoal m-0">
              予定を追加
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-charcoal-light hover:text-charcoal hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer border-none bg-transparent"
            title="閉じる"
          >
            <X size={18} />
          </button>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* タイトル入力 */}
          <div>
            <label htmlFor="event-title" className="block text-xs font-semibold text-charcoal-light mb-1">
              タイトル <span className="text-rose-500">*</span>
            </label>
            <input
              id="event-title"
              ref={titleInputRef}
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: ミーティング、買い物、通院"
              className="w-full px-3.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] text-charcoal text-sm outline-none border border-transparent focus:border-amber-500/30 focus:bg-white dark:focus:bg-stone-800 transition-all"
            />
          </div>

          {/* 日付選択 */}
          <div>
            <label htmlFor="event-date" className="block text-xs font-semibold text-charcoal-light mb-1">
              日付
            </label>
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04]">
              <CalendarIcon size={16} className="text-charcoal-light shrink-0" />
              <input
                id="event-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-transparent text-charcoal text-sm outline-none border-none cursor-pointer"
              />
            </div>
          </div>

          {/* 終日トグル ＆ 時間入力 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-charcoal-light">
                時間設定
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-charcoal-mid cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAllDay}
                  onChange={(e) => setIsAllDay(e.target.checked)}
                  className="rounded border-charcoal-light text-amber-600 focus:ring-amber-500"
                />
                <span>終日</span>
              </label>
            </div>

            {!isAllDay ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04]">
                  <Clock size={14} className="text-charcoal-light shrink-0" />
                  <span className="text-[0.72rem] text-charcoal-light shrink-0">開始</span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-transparent text-charcoal text-xs outline-none border-none"
                  />
                </div>
                <span className="text-xs text-charcoal-xlight">〜</span>
                <div className="flex-1 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04]">
                  <Clock size={14} className="text-charcoal-light shrink-0" />
                  <span className="text-[0.72rem] text-charcoal-light shrink-0">終了</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-transparent text-charcoal text-xs outline-none border-none"
                  />
                </div>
              </div>
            ) : (
              <div className="px-3 py-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] text-xs text-charcoal-light">
                終日の予定として登録されます
              </div>
            )}
          </div>

          {/* メモ入力 */}
          <div>
            <label className="block text-xs font-semibold text-charcoal-light mb-1">
              メモ (任意)
            </label>
            <div className="flex items-start gap-2 px-3.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04]">
              <AlignLeft size={16} className="text-charcoal-light shrink-0 mt-0.5" />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="補足情報や場所など"
                rows={2}
                className="w-full bg-transparent text-charcoal text-xs outline-none border-none resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* アクションボタン */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/[0.05] dark:border-white/[0.06]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-charcoal-light hover:text-charcoal hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer border-none bg-transparent"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer border-none"
            >
              {isSubmitting ? "追加中..." : "予定を追加"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
