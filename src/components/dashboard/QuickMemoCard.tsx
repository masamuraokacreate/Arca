/**
 * src/components/dashboard/QuickMemoCard.tsx
 * Arca — サブグリッド右カラム（1.2fr）: クイックメモ (Scratchpad)
 *
 * 設計原則 (Core/Rules.md):
 *  - 枠線完全排除（border-none）、微細二重シャドウ、Apple HIG準拠
 *  - 絵文字完全排除（Lucide React SVGアイコンのみ）
 *  - 背景と同化しない薄い塗り面（#F5F2EB dark:bg-stone-800/80）の textarea コンテナ
 *  - ローカルストレージへの即時自動保存
 *  - 右端に「保存済み」ステータスインジケータ
 */

import React, { useState, useEffect, useRef } from "react";
import { PenLine, Check } from "lucide-react";

const STORAGE_KEY = "arca_quick_memo";

export const QuickMemoCard: React.FC = () => {
  const [memo, setMemo] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初期読み込み
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        setMemo(saved);
      }
    } catch (err) {
      console.warn("Failed to read quick memo from localStorage:", err);
    }
  }, []);

  // メモ変更ハンドラ
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMemo(val);
    setSaveStatus("saving");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, val);
        setSaveStatus("saved");
      } catch (err) {
        console.warn("Failed to save quick memo to localStorage:", err);
      }
    }, 300);
  };

  return (
    <div
      data-testid="quick-memo-card"
      className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-xs flex flex-col h-full overflow-hidden border-none transition-all"
      style={{
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.025), 0 1px 3px rgba(0, 0, 0, 0.02)",
      }}
    >
      {/* ─── ヘッダー ─── */}
      <div className="flex items-center justify-between h-7 mb-3 pb-2 border-b border-stone-100 dark:border-stone-800 shrink-0">
        <div className="flex items-center gap-2">
          <PenLine size={16} className="text-amber-700 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-100 tracking-tight">
            クイックメモ
          </span>
        </div>

        {/* 右端: 保存状態インジケータ */}
        <div className="flex items-center gap-1 text-[0.68rem] text-stone-400 dark:text-stone-500 font-medium">
          {saveStatus === "saved" ? (
            <>
              <Check size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>保存済み</span>
            </>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">保存中...</span>
          )}
        </div>
      </div>

      {/* ─── 本文: アフォーダンスの高い塗り面コンテナ ─── */}
      <div className="flex-1 min-h-0 bg-[#F5F2EB] dark:bg-stone-800/80 rounded-xl p-3 flex flex-col focus-within:bg-white dark:focus-within:bg-stone-900 focus-within:ring-1 focus-within:ring-amber-500/25 transition-all">
        <textarea
          value={memo}
          onChange={handleChange}
          placeholder="思いついたことや一時メモを記録（ローカルに自動保存されます）..."
          className="appearance-none border-none outline-none bg-transparent resize-none w-full flex-1 text-xs text-stone-800 dark:text-stone-100 placeholder:text-stone-400 leading-relaxed font-sans"
        />
      </div>
    </div>
  );
};
