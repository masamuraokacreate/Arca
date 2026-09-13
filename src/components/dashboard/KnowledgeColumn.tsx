/**
 * src/components/dashboard/KnowledgeColumn.tsx
 * Arca — Dashboard Column 3: ナレッジ・ストック（最近のノート & クイックメモ Scratchpad）
 *
 * 構成:
 *  1. 最近のノート (RecentNotesCard) - 上段 210px
 *  2. クイックメモ (QuickMemoCard) - 下段 240px
 *
 * 設計方針 (Core/Rules.md):
 *  - 画面の過度な占有を解消し、情報密度を適正化
 *  - 枠線完全排除、微細二重シャドウ、Apple HIG準拠の角丸・余白
 *  - 絵文字完全排除（Lucide React SVGアイコンのみ）
 *  - クイックメモは textarea による Scratchpad 形式（localStorage自動保存）
 */

import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  PenLine,
  ChevronRight,
  Check,
} from "lucide-react";
import type { NoteItem } from "../../types";

// ─────────────────────────────────────────
// 1. 最近のノートカード (RecentNotesCard) - 上段 210px
// ─────────────────────────────────────────

export interface RecentNotesCardProps {
  notes: NoteItem[];
  onNavigate?: (module: "dashboard" | "tasks" | "lists" | "calendar" | "notes" | "recipes" | "finance") => void;
  onSelectNote?: (noteId: string) => void;
}

export const RecentNotesCard: React.FC<RecentNotesCardProps> = ({
  notes,
  onNavigate,
  onSelectNote,
}) => {
  // 有効なノートから直近更新件数を抽出
  const activeNotes = notes.filter(
    (n) => !n.isDeleted && (n.title.trim() !== "" || n.content.trim() !== "")
  );
  const recentNotes = activeNotes.slice(0, 6);

  return (
    <div
      className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-xs flex flex-col h-full overflow-hidden border-none"
      style={{
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.025), 0 1px 3px rgba(0, 0, 0, 0.02)",
      }}
    >
      {/* ─── ヘッダー (h-7 / 28px) ─── */}
      <div className="flex items-center justify-between h-7 mb-3.5 pb-2 border-b border-stone-100 dark:border-stone-800 shrink-0">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-amber-700 dark:text-amber-400" />
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-100 tracking-tight">
            最近のノート
          </span>
          <span className="text-xs font-medium text-stone-600 dark:text-stone-400">
            ({activeNotes.length})
          </span>
        </div>

        <button
          type="button"
          aria-label="Notes"
          onClick={() => onNavigate?.("notes")}
          className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-amber-700 dark:hover:text-amber-400 transition-colors cursor-pointer bg-transparent border-none p-0"
        >
          <span>Notes</span>
          <ChevronRight size={13} strokeWidth={2.5} />
        </button>
      </div>

      {/* ─── 本文スクロール領域 ─── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar pr-0.5">
        {recentNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center my-auto py-2 text-center">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
              <FileText size={16} className="text-amber-700 dark:text-amber-400" />
            </div>
            <p className="text-xs font-medium text-stone-700 dark:text-stone-200 mb-0.5">
              ノートを作成してみましょう
            </p>
            <p className="text-[0.7rem] text-stone-600 dark:text-stone-400">
              アイデアや記録を素早く書き留められます
            </p>
          </div>
        ) : (
          <ul className="list-none m-0 p-0 space-y-1.5">
            {recentNotes.map((note) => (
              <li
                key={note.id}
                onClick={() => {
                  if (onSelectNote) {
                    onSelectNote(note.id);
                  } else if (onNavigate) {
                    onNavigate("notes");
                  }
                }}
                className="p-2 rounded-xl hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
              >
                <p className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate m-0">
                  {note.title || "無題のノート"}
                </p>
                {note.content && (
                  <p className="text-[0.68rem] text-stone-600 dark:text-stone-400 truncate mt-0.5 m-0 leading-relaxed">
                    {note.content.replace(/[#*`_~]/g, "").slice(0, 50)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─── フッター (mt-auto 最下部吸着) ─── */}
      <div className="mt-auto pt-2.5 shrink-0 flex items-center justify-end">
        <button
          type="button"
          onClick={() => onNavigate?.("notes")}
          className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300 hover:text-amber-900 transition-colors cursor-pointer bg-transparent border-none p-0"
        >
          <span>ノート一覧を見る</span>
          <ChevronRight size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────
// 2. クイックメモ Scratchpad カード (QuickMemoCard) - 下段 240px
// ─────────────────────────────────────────

export interface QuickMemoCardProps {
  storageKey?: string;
}

export const QuickMemoCard: React.FC<QuickMemoCardProps> = ({
  storageKey = "arca_quick_memo_draft",
}) => {
  const [content, setContent] = useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) || "";
    } catch {
      return "";
    }
  });
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const saveTimeoutRef = useRef<number | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    setIsSaved(false);

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, val);
        setIsSaved(true);
      } catch (err) {
        console.error("Failed to save quick memo:", err);
      }
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-xs flex flex-col h-full overflow-hidden border-none"
      style={{
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.025), 0 1px 3px rgba(0, 0, 0, 0.02)",
      }}
    >
      {/* ─── ヘッダー (h-7 / 28px) ─── */}
      <div className="flex items-center justify-between h-7 mb-3.5 pb-2 border-b border-stone-100 dark:border-stone-800 shrink-0">
        <div className="flex items-center gap-2">
          <PenLine size={16} className="text-amber-700 dark:text-amber-400" />
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-100 tracking-tight">
            クイックメモ
          </span>
        </div>

        <div className="flex items-center gap-1 text-[0.68rem] text-stone-500 font-medium">
          {isSaved ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check size={11} strokeWidth={2.5} />
              <span>保存済み</span>
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">保存中...</span>
          )}
        </div>
      </div>

      {/* ─── テキストエリア（カード内余白にフィット） ─── */}
      <div className="flex-1 flex flex-col min-h-0">
        <textarea
          value={content}
          onChange={handleChange}
          placeholder="思いついたことや一時メモを記録（ローカルに自動保存されます）..."
          className="w-full h-full resize-none bg-transparent border-none outline-none text-xs text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 leading-relaxed font-sans"
        />
      </div>

      {/* ─── フッター (mt-auto 最下部吸着) ─── */}
      <div className="mt-auto pt-2 shrink-0 flex items-center justify-between text-[0.68rem] text-stone-500 border-t border-stone-100 dark:border-stone-800/60">
        <span>Scratchpad</span>
        {content.trim() && (
          <button
            type="button"
            onClick={() => {
              setContent("");
              try {
                localStorage.removeItem(storageKey);
                setIsSaved(true);
              } catch {}
            }}
            className="text-stone-500 hover:text-rose-600 transition-colors bg-transparent border-none p-0 cursor-pointer text-[0.68rem]"
          >
            クリア
          </button>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────
// 後方互換用 KnowledgeColumn コンポーネント
// ─────────────────────────────────────────

export interface KnowledgeColumnProps extends RecentNotesCardProps {
  onAddNote?: (text: string) => Promise<void> | void;
}

export const KnowledgeColumn: React.FC<KnowledgeColumnProps> = (props) => {
  return (
    <div className="flex flex-col gap-5">
      <RecentNotesCard
        notes={props.notes}
        onNavigate={props.onNavigate}
        onSelectNote={props.onSelectNote}
      />
      <QuickMemoCard />
    </div>
  );
};

