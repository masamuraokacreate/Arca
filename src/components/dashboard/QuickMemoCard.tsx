/**
 * src/components/dashboard/QuickMemoCard.tsx
 * Arca — サブグリッド右カラム（1.2fr）: クイックメモ (Scratchpad)
 *
 * 設計原則 (Core/Rules.md):
 *  - 枠線完全排除（border-none）、微細二重シャドウ、Apple HIG準拠
 *  - 絵文字完全排除（Lucide React SVGアイコンのみ）
 *  - 背景と同化しない薄い塗り面（#F5F2EB dark:bg-stone-800/80）の textarea コンテナ
 *  - ローカルストレージへの即時自動保存
 *  - 右上「Notesに保存」ボタンでFirestoreのnotesコレクションに保存
 */

import React, { useState, useEffect, useRef } from "react";
import { PenLine, Save, Check } from "lucide-react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";

const STORAGE_KEY = "arca_quick_memo";

export const QuickMemoCard: React.FC = () => {
  const [memo, setMemo] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  // Notesへの保存状態: idle / saving / done
  const [noteSaveStatus, setNoteSaveStatus] = useState<"idle" | "saving" | "done">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteSaveDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // メモ変更ハンドラ（ローカルストレージへ自動保存）
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

  // NotesコレクションへFirestore保存
  const handleSaveToNotes = async () => {
    const trimmed = memo.trim();
    if (!trimmed || noteSaveStatus === "saving") return;

    setNoteSaveStatus("saving");
    try {
      // タイトルは先頭30文字（改行を除去）
      const autoTitle = trimmed.replace(/\n/g, " ").slice(0, 30) || "クイックメモ";
      await addDoc(collection(db, "notes"), {
        title: autoTitle,
        content: trimmed,
        tags: ["クイックメモ"],
        spaceType: "memo",
        parentId: null,
        isDeleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 入力欄をクリア＆ローカルストレージも削除
      setMemo("");
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (_) {
        // 無視
      }
      setSaveStatus("saved");

      // 成功表示（2秒後にidle）
      setNoteSaveStatus("done");
      if (noteSaveDoneTimerRef.current) {
        clearTimeout(noteSaveDoneTimerRef.current);
      }
      noteSaveDoneTimerRef.current = setTimeout(() => {
        setNoteSaveStatus("idle");
      }, 2000);
    } catch (err) {
      console.error("Failed to save memo to Notes:", err);
      setNoteSaveStatus("idle");
    }
  };

  return (
    <div
      data-testid="quick-memo-card"
      className="bg-white dark:bg-[var(--bg-card-solid)] rounded-2xl p-5 shadow-xs flex flex-col h-full overflow-hidden border-none transition-all"
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

        {/* 右端: Notesに保存ボタン */}
        <button
          type="button"
          data-testid="save-to-notes-btn"
          onClick={handleSaveToNotes}
          disabled={!memo.trim() || noteSaveStatus === "saving"}
          className={[
            "appearance-none inline-flex items-center gap-1 px-2 py-1 rounded-lg",
            "text-[0.68rem] font-semibold transition-colors cursor-pointer border-none",
            noteSaveStatus === "done"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : noteSaveStatus === "saving"
              ? "bg-stone-100 dark:bg-white/[0.08] text-stone-400 cursor-not-allowed"
              : !memo.trim()
              ? "bg-transparent text-stone-300 dark:text-stone-600 cursor-not-allowed"
              : "bg-[#F5F2EB] dark:bg-white/[0.08] text-amber-800 dark:text-amber-300 hover:bg-amber-500/15",
          ].join(" ")}
          title="Notesに保存してメモをクリア"
        >
          {noteSaveStatus === "done" ? (
            <>
              <Check size={11} strokeWidth={2.5} />
              <span>保存済み</span>
            </>
          ) : (
            <>
              <Save size={11} strokeWidth={2} />
              <span>{noteSaveStatus === "saving" ? "保存中..." : "Notesに保存"}</span>
            </>
          )}
        </button>
      </div>

      {/* ─── 本文: アフォーダンスの高い塗り面コンテナ ─── */}
      <div className="flex-1 min-h-0 bg-[#F5F2EB] dark:bg-[var(--bg-surface)] rounded-xl p-3 flex flex-col focus-within:bg-white dark:focus-within:bg-[var(--bg-surface-glass)] focus-within:ring-1 focus-within:ring-amber-500/25 transition-all">
        <textarea
          value={memo}
          onChange={handleChange}
          placeholder="思いついたことや一時メモを記録...「Notesに保存」でノートに転記できます"
          className="appearance-none border-none outline-none bg-transparent resize-none w-full flex-1 text-xs text-stone-800 dark:text-stone-100 placeholder:text-stone-400 leading-relaxed font-sans"
        />
      </div>

      {/* ─── フッター: ローカル保存ステータス ─── */}
      <div className="flex justify-end mt-1.5 shrink-0">
        <span className="flex items-center gap-0.5 text-[0.62rem] text-stone-300 dark:text-stone-600">
          {saveStatus === "saving" ? (
            <span className="text-amber-400 dark:text-amber-500">保存中...</span>
          ) : (
            <>
              <Check size={10} className="text-stone-300 dark:text-stone-600" />
              <span>自動保存済み</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
};
